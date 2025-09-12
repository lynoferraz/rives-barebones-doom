#include <cstdint>

#include <cerrno>  // errno
#include <cstdio>  // std::fprintf/stderr
#include <cstdlib> // std::strerror
#include <cstring> // std::strerror
#include <fstream> // file stream operations
#include <iomanip> // Required for std::hex, std::setw, std::setfill
#include <sstream> // Required for std::stringstream
#include <string>  // for string class

#include <array> // std::array
#include <tuple> // std::ignore

extern "C" {
#include <fcntl.h>    // open
#include <sys/mman.h> // mmap/msync
#include <sys/stat.h> // stat
#include <sys/wait.h> // waitpid
#include <unistd.h>   // close/lseek

#include <libcmt/abi.h>
#include <libcmt/io.h>
#include <libcmt/rollup.h>
}

#define MERKLE_PATH "/mnt/merkle/merkle"
#define BE256_SIZE 32
#define BYTES32_SIZE 32
#define MIN_GAMEPLAY_LOG_SIZE 16
#define MAX_GAMEPLAY_LOG_SIZE 1048576
#define TEMPFILE_SIZE 14
#define CARTRIDGE_PATH "/cartridges/freedoom.sqfs"

namespace {

using be256 = std::array<uint8_t, BE256_SIZE>;

using wallet_address = cmt_abi_address_t;

typedef struct bytes32 {
  uint8_t data[BYTES32_SIZE];
} bytes32_t;

bool operator==(const bytes32_t &a, const bytes32_t &b) {
  return std::equal(std::begin(a.data), std::end(a.data), std::begin(b.data));
}

////////////////////////////////////////////////////////////////////////////////
// Rollup utilities.

// Payload encoding gameplay inputs
struct [[gnu::packed]] gameplay_payload {
  bytes32_t outhash;
  char *gameplay_log;
};

// Payload encoding gameplay inputs
struct [[gnu::packed]] gameplay_notice {
  wallet_address user;
  be256 timestamp;
  be256 score;
  be256 input_index;
};

template <typename T>
[[nodiscard]]
constexpr cmt_abi_bytes_t payload_to_bytes(const T &payload) {
  cmt_abi_bytes_t payload_bytes = {
      .length = sizeof(T),
      .data = const_cast<T *>(
          &payload) // NOLINT(cppcoreguidelines-pro-type-const-cast)
  };
  return payload_bytes;
}

// Emit a report into rollup device.
template <typename T>
[[nodiscard]]
bool rollup_emit_report(cmt_rollup_t *rollup, const T &payload) {
  const cmt_abi_bytes_t payload_bytes = payload_to_bytes(payload);
  const int err = cmt_rollup_emit_report(rollup, &payload_bytes);
  if (err < 0) {
    std::ignore = std::fprintf(stderr, "[rives] unable to emit report: %s\n",
                               std::strerror(-err));
    return false;
  }
  return true;
}

// Emit a notice into rollup device.
template <typename T>
[[nodiscard]]
bool rollup_emit_notice(cmt_rollup_t *rollup, const T &payload) {
  const cmt_abi_bytes_t payload_bytes = payload_to_bytes(payload);
  const int err = cmt_rollup_emit_notice(rollup, &payload_bytes, nullptr);
  if (err < 0) {
    std::ignore = std::fprintf(stderr, "[rives] unable to emit notice: %s\n",
                               std::strerror(-err));
    return false;
  }
  return true;
}

// Finish last rollup request, wait for next rollup request and process it.
// For every new request, reads an input POD and call backs its respective
// advance or inspect state handler.
template <typename ADVANCE_STATE, typename INSPECT_STATE>
[[nodiscard]]
bool rollup_process_next_request(cmt_rollup_t *rollup,
                                 ADVANCE_STATE advance_state,
                                 INSPECT_STATE inspect_state,
                                 bool last_request_status) {

  // Finish previous request and wait for the next request.
  std::ignore = std::fprintf(
      stdout, "[rives] finishing previous request with status %d\n",
      last_request_status);
  cmt_rollup_finish_t finish{.accept_previous_request = last_request_status};
  sync(); // ensure data is written to disk
  const int err = cmt_rollup_finish(rollup, &finish);
  if (err < 0) {
    std::ignore =
        std::fprintf(stderr, "[rives] unable to perform rollup finish: %s\n",
                     std::strerror(-err));
    return false;
  }

  // Handle request
  switch (finish.next_request_type) {
  case HTIF_YIELD_REASON_ADVANCE: { // Advance state.
    return advance_state(rollup);
  }
  case HTIF_YIELD_REASON_INSPECT: { // Inspect state.
    // Call inspect state handler.
    return inspect_state(rollup);
  }
  default: { // Invalid request.
    std::ignore = std::fprintf(stderr, "[rives] invalid request type\n");
    return false;
  }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Rives barebones application.

// Status code sent in as reports for well formed advance requests.
enum handle_status : uint8_t {
  STATUS_SUCCESS = 0,
  STATUS_INVALID_REQUEST,
  STATUS_INPUT_ERROR,
  STATUS_VERIFICATION_ERROR,
  STATUS_OUTHASH_ERROR,
  STATUS_FILE_ERROR,
  STATUS_FORK_ERROR,
};

// Status code for advance reports.
struct [[gnu::packed]] handle_report {
  handle_status status{};
};

// Process gameplay validation
handle_status process_verification(const cmt_rollup_advance_t &input) {

  // Step 1: Validate input (size)
  if (input.payload.length < BYTES32_SIZE + MIN_GAMEPLAY_LOG_SIZE) {
    std::ignore =
        std::fprintf(stderr, "[rives] invalid payload size: too small\n");
    return STATUS_INPUT_ERROR;
  }
  if (input.payload.length > MAX_GAMEPLAY_LOG_SIZE) {
    std::ignore =
        std::fprintf(stderr, "[rives] invalid payload size: too large\n");
    return STATUS_INPUT_ERROR;
  }

  // Step 2: Validate gameplay log
  // Step 2.1: get user address and convert to hex to use as entropy
  std::stringstream msg_sender_ss;
  msg_sender_ss << std::hex;
  msg_sender_ss << "0x";
  for (int i(0); i < CMT_ABI_ADDRESS_LENGTH; ++i)
    msg_sender_ss << std::setw(2) << std::setfill('0')
                  << static_cast<int>(input.msg_sender.data[i]);
  std::ignore = std::fprintf(stdout, "[rives] Msg sender: %s\n",
                             msg_sender_ss.str().c_str());

  // Step 2.2: save gameplay log in temp file

  // Write the gameplay log to the temporary file
  char gameplay_log_filepath[TEMPFILE_SIZE + 1] = "/run/tmpXXXXXX";
  int gameplay_log_fd = mkstemp(gameplay_log_filepath);

  // Check if the file creation was successful
  if (gameplay_log_fd == -1) {
    std::ignore = std::fprintf(stderr, "[rives] error opening temp file\n");
    return STATUS_FILE_ERROR;
  }

  if (write(gameplay_log_fd,
            reinterpret_cast<const char *>(input.payload.data) + BYTES32_SIZE,
            input.payload.length - BYTES32_SIZE) == -1) {
    std::ignore =
        std::fprintf(stderr, "[rives] error writing to temporary file\n");
    return STATUS_FILE_ERROR;
  }
  if (close(gameplay_log_fd) == -1) {
    std::ignore =
        std::fprintf(stderr, "[rives] error closing temporary file\n");
    return STATUS_FILE_ERROR;
  }

  // Step 2.3: prepare temp files for outcard and outhash
  char outcard_filepath[TEMPFILE_SIZE + 1] = "/run/tmpXXXXXX";
  std::ignore = mktemp(outcard_filepath);

  char outhash_filepath[TEMPFILE_SIZE + 1] = "/run/tmpXXXXXX";
  std::ignore = mktemp(outhash_filepath);

  // Step 2.4: set up and run verification

  pid_t pid = fork();

  if (pid == -1) {
    std::ignore = std::fprintf(stderr, "[rives] error: failed to fork.\n");
    // remove the file even on error
    std::ignore = unlink(gameplay_log_filepath);
    std::ignore = unlink(outcard_filepath);
    std::ignore = unlink(outhash_filepath);
    return STATUS_FORK_ERROR;
  } else if (pid == 0) {
    // child

    std::ignore = std::fprintf(
        stdout,
        "[rives] full cmd: /rivos/usr/sbin/riv-chroot /rivos --setenv "
        "RIV_CARTRIDGE %s --setenv RIV_REPLAYLOG %s --setenv RIV_OUTCARD %s "
        "--setenv RIV_OUTHASH %s --setenv RIV_NO_YIELD y --setenv RIV_ENTROPY "
        "%s "
        "riv-run\n",
        CARTRIDGE_PATH, gameplay_log_filepath, outcard_filepath,
        outhash_filepath, msg_sender_ss.str().c_str());

    const int err =
        execl("/rivos/usr/sbin/riv-chroot", "/rivos/usr/sbin/riv-chroot",
              "/rivos", "--setenv", "RIV_CARTRIDGE", CARTRIDGE_PATH, "--setenv",
              "RIV_REPLAYLOG", gameplay_log_filepath, "--setenv", "RIV_OUTCARD",
              outcard_filepath, "--setenv", "RIV_OUTHASH", outhash_filepath,
              "--setenv", "RIV_NO_YIELD", "y", "--setenv", "RIV_ENTROPY",
              msg_sender_ss.str().c_str(), "riv-run", NULL);

    if (err != 0) {
      std::ignore =
          std::fprintf(stderr, "[rives] error running verification: %s\n",
                       std::strerror(-err));
      _exit(STATUS_VERIFICATION_ERROR);
    }

    _exit(STATUS_SUCCESS);
  }

  int status;
  waitpid(pid, &status, 0);
  std::ignore = std::fprintf(stdout, "[rives] wait status: %d (%d, %d)\n",
                             status, WIFEXITED(status), WEXITSTATUS(status));

  if (!WIFEXITED(status) || WEXITSTATUS(status) != STATUS_SUCCESS) {
    // remove the file even on error
    std::ignore = unlink(gameplay_log_filepath);
    std::ignore = unlink(outcard_filepath);
    std::ignore = unlink(outhash_filepath);
    return STATUS_VERIFICATION_ERROR;
  }
  // Step 3: get outhash and compare with input outhash
  std::ifstream outhash_file(outhash_filepath);
  if (!outhash_file.is_open()) {
    std::ignore = std::fprintf(stderr, "[rives] error opening id file\n");
    // remove the file even on error
    std::ignore = unlink(gameplay_log_filepath);
    std::ignore = unlink(outcard_filepath);
    std::ignore = unlink(outhash_filepath);
    return STATUS_FILE_ERROR;
  }
  std::string outhash_hex_str;
  std::getline(outhash_file, outhash_hex_str);
  outhash_file.close();

  bytes32_t verification_outhash;
  bytes32_t payload_outhash;
  const uint8_t *payload_data =
      reinterpret_cast<const uint8_t *>(input.payload.data);
  // Loop through the hex string, two characters at a time
  for (size_t i = 0; i < BYTES32_SIZE; i += 1) {
    std::string byteString = outhash_hex_str.substr(2 * i, 2);
    uint8_t byteValue =
        static_cast<uint8_t>(std::stoi(byteString, nullptr, 16));
    verification_outhash.data[i] = byteValue;
    payload_outhash.data[i] = payload_data[i];
  }

  if (!(payload_outhash == verification_outhash)) {
    std::ignore = std::fprintf(
        stderr, "[rives] error outhash mismatch (verification outhash %s)\n",
        outhash_hex_str.c_str());
    // remove the file even on error
    std::ignore = unlink(gameplay_log_filepath);
    std::ignore = unlink(outcard_filepath);
    std::ignore = unlink(outhash_filepath);
    return STATUS_OUTHASH_ERROR;
  }

  // Step 4: Get outcard and extract score
  // Step 5: cleanup temp files
  std::ignore = unlink(gameplay_log_filepath);
  std::ignore = unlink(outcard_filepath);
  std::ignore = unlink(outhash_filepath);

  // Step 6: prepare and emit notice (can't revert after, so no errors from here
  // on)

  return STATUS_SUCCESS;
}

// Process advance state requests
bool advance_state(cmt_rollup_t *rollup) {
  // Read the input.
  std::ignore = std::fprintf(stderr, "[rives] advance request\n");
  cmt_rollup_advance_t input{};
  const int err = cmt_rollup_read_advance_state(rollup, &input);
  if (err < 0) {
    std::ignore =
        std::fprintf(stderr, "[rives] unable to read advance state: %s\n",
                     std::strerror(-err));
    if (err == -ENOBUFS) {
      std::ignore = std::fprintf(
          stderr, "[rives] advance state not found, forcing exit\n");
      exit(-1); // force exit. Exceptional error
    }
    std::ignore = std::fprintf(stderr, "[rives] invalid advance state\n");
    std::ignore =
        rollup_emit_report(rollup, handle_report{STATUS_INVALID_REQUEST});
    return true; // No reverts
  }
  std::ignore = std::fprintf(stdout, "[rives] advance request with size %zu\n",
                             input.payload.length);

  const handle_status verification_err = process_verification(input);
  if (verification_err != STATUS_SUCCESS) {
    std::ignore = std::fprintf(stderr, "[rives] verification error %d\n",
                               verification_err);
    std::ignore = rollup_emit_report(rollup, handle_report{verification_err});
    return true; // No reverts
  }
  // Invalid request.
  std::ignore = std::fprintf(stderr, "[rives] gameplay verified\n");
  return true;
}

// Ignore inspect state queries
bool inspect_state(cmt_rollup_t *rollup) {
  // Inspect balance.
  cmt_rollup_inspect_t input{};
  const int err = cmt_rollup_read_inspect_state(rollup, &input);
  if (err < 0) {
    std::ignore =
        std::fprintf(stderr, "[rives] unable to read inspect state: %s\n",
                     std::strerror(-err));
    std::ignore =
        rollup_emit_report(rollup, handle_report{STATUS_INVALID_REQUEST});
    return false;
  }
  std::ignore = std::fprintf(stdout, "[rives] inspect request with size %zu\n",
                             input.payload.length);

  std::ignore = std::fprintf(stderr, "[rives] inspect ignored\n");
  return false;
}

}; // anonymous namespace

// Application main.
int main() {
  cmt_rollup_t rollup{};
  // Disable buffering of stderr to avoid dynamic allocations behind the scenes
  if (std::setvbuf(stderr, nullptr, _IONBF, 0) != 0) {
    std::ignore =
        std::fprintf(stderr, "[rives] unable to disable stderr buffering: %s\n",
                     std::strerror(errno));
    return -1;
  }

  // Initialize rollup device.
  const int err = cmt_rollup_init(&rollup);
  if (err != 0) {
    std::ignore =
        std::fprintf(stderr, "[rives] unable to initialize rollup device: %s\n",
                     std::strerror(-err));
    return -1;
  }

  struct stat buffer;
  if (stat(MERKLE_PATH, &buffer) == 0) {
    const int err_merkle = cmt_rollup_load_merkle(&rollup, MERKLE_PATH);
    if (err_merkle != 0) {
      std::ignore =
          std::fprintf(stderr, "[rives] unable to load merkle tree: %s\n",
                       std::strerror(-err_merkle));
      return -1;
    }
  }

  // Process requests forever.
  std::ignore = std::fprintf(stderr, "[rives] processing rollup requests...\n");
  bool last_request_status = true;
  while (true) {
    if (last_request_status) {
      mode_t original_umask = umask(0000);
      const int err_merkle = cmt_rollup_save_merkle(&rollup, MERKLE_PATH);
      if (err_merkle != 0) {
        std::ignore =
            std::fprintf(stderr, "[rives] unable to save merkle tree: %s\n",
                         std::strerror(-err_merkle));
        return -1;
      }
      umask(original_umask);
    }

    last_request_status = rollup_process_next_request(
        &rollup, advance_state, inspect_state, last_request_status);
  }
  // Unreachable code, return is intentionally omitted.
}
