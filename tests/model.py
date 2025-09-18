from pydantic import BaseModel

from cartesi import abi

# Status codes
STATUS_SUCCESS = 0
STATUS_INPUT_ERROR = 1
STATUS_NOTICE_ERROR = 2
STATUS_FILE_ERROR = 3
STATUS_FORK_ERROR = 4
STATUS_VERIFICATION_ERROR = 5
STATUS_OUTHASH_ERROR = 6
STATUS_OUTCARD_ERROR = 7
STATUS_RUNTIME_EXCEPTION = 8
STATUS_UNKNOWN_EXCEPTION = 9

USER1 = "0xdeadbeef7dc51b33c9a3e4a21ae053daa1872810"
NOP_GAMEPLAY_OUTHASH = b'\xe0\x85Y9\xb7\xb7F\xe5\xc5T\xe9!\xd5\xcb3_\xa1+528v\xc6\x9d\x0e\x03\xe6\x85\xa0{\xb8b'
NOP_GAMEPLAY_LOG = b'\x01\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0f\x00\x00\x00'
# score = 99983
GAMEPLAY_OUTHASH = b'\xb0R-\xdc\x97\xcbA\xfc\xb8\xd2fbZ\xcaw\xd7\xe4\xa1\x07J.\xbf\x96O\xa9[x\xd3\xf1;\xa36'
GAMEPLAY_LOG     = b'\x01\x01\x07\x07N\x00\x00\x00@\x00\x00\x00R\x00\x00\x00frhsi g%\xca+\x0e\xc2@\x14\x05\xd0w?\xef\x0e\x996#\xda`HP\x08\x04\xbb`\xff\x8b\xaa\xa89\xea\x14\x88\xa2H\x9b\xbc-\xcbdwYNl\xbbH\xb2b\xdf!e\x99\xa0!WH\xc7d\xd9\xa5z\x7f\x05ay\x06SI\x8e\x06\xb8\xf0\xe9\xc6FklR4:\x9c\x9d\x9d\xf3\x18\t40\xb2\xf3\xac&\x1eg6\xe8\xd5\xeb\xf9\xfb\xe7\x02'
# score = 109172
LGNOP_GAMEPLAY_OUTHASH = b'\x87\xbe\xbdm\xb5h\\\xe41\xce\tC3\n]g\xbe$,\\\xc0\xf0]J %\x14\xddL\xd6g\x80'
LGNOP_GAMEPLAY_LOG = b'\x01\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00<\xca\x00\x00'
# score = 109172

USER2 = f"{2:#042x}"
USER2_GAMEPLAY_OUTHASH = b'\xac\x1c\x18\x0c\xce>\x15\xf0J*\x92\xeb\xae\xae\x17MV\x95w\x17\xe4*\xb2\xe8)k\xabmx\xdeS:'
# score = 48227

# inputs
class Payload(BaseModel):
    outhash: abi.Bytes32
    gameplay_log: abi.Bytes

# outputs
class VerificationNotice(BaseModel):
    user: abi.Address
    timestamp: abi.UInt256
    score: abi.Int256
    input_index: abi.UInt256

class ErrorModel(BaseModel):
    code: int
    message: str

class ErrorReport(BaseModel):
    error: ErrorModel
