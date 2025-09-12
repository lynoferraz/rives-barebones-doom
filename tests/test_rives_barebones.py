import pytest
from pydantic import BaseModel

from cartesi import abi

from cartesapp.utils import bytes2hex, hex2562uint
from cartesapp.testclient import TestClient

# Status codes
STATUS_SUCCESS = 0
STATUS_INVALID_REQUEST = 1
STATUS_INPUT_ERROR = 2
STATUS_VERIFICATION_ERROR = 3
STATUS_OUTHASH_ERROR = 4
STATUS_FILE_ERROR = 5
STATUS_FORK_ERROR = 6

# USER1 = "0xdeadbeef7dc51b33c9a3e4a21ae053daa1872810"
NOP_GAMEPLAY_OUTHASH = b'\xe0\x85Y9\xb7\xb7F\xe5\xc5T\xe9!\xd5\xcb3_\xa1+528v\xc6\x9d\x0e\x03\xe6\x85\xa0{\xb8b'
NOP_GAMEPLAY_LOG = b'\x01\x00\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x0f\x00\x00\x00'
# score = 99983
GAMEPLAY_OUTHASH = b'\xb0R-\xdc\x97\xcbA\xfc\xb8\xd2fbZ\xcaw\xd7\xe4\xa1\x07J.\xbf\x96O\xa9[x\xd3\xf1;\xa36'
GAMEPLAY_LOG     = b'\x01\x01\x07\x07N\x00\x00\x00@\x00\x00\x00R\x00\x00\x00frhsi g%\xca+\x0e\xc2@\x14\x05\xd0w?\xef\x0e\x996#\xda`HP\x08\x04\xbb`\xff\x8b\xaa\xa89\xea\x14\x88\xa2H\x9b\xbc-\xcbdwYNl\xbbH\xb2b\xdf!e\x99\xa0!WH\xc7d\xd9\xa5z\x7f\x05ay\x06SI\x8e\x06\xb8\xf0\xe9\xc6FklR4:\x9c\x9d\x9d\xf3\x18\t40\xb2\xf3\xac&\x1eg6\xe8\xd5\xeb\xf9\xfb\xe7\x02'
# score = 109172

USER2 = f"{2:#042x}"
USER2_GAMEPLAY_OUTHASH = b'\xac\x1c\x18\x0c\xce>\x15\xf0J*\x92\xeb\xae\xae\x17MV\x95w\x17\xe4*\xb2\xe8)k\xabmx\xdeS:'
# score = 107172

# inputs
class Payload(BaseModel):
    outhash: abi.Bytes32
    gameplay_log: abi.Bytes

###
# Tests

# test payload
@pytest.fixture()
def nop_gameplay_payload() -> Payload:
    return Payload(
        outhash=NOP_GAMEPLAY_OUTHASH,
        gameplay_log=NOP_GAMEPLAY_LOG
    )

# test application setup
@pytest.fixture(scope='session')
def app_client() -> TestClient:
    client = TestClient()
    return client

# test payload
@pytest.fixture()
def gameplay_payload() -> Payload:
    return Payload(
        outhash=GAMEPLAY_OUTHASH,
        gameplay_log=GAMEPLAY_LOG
    )

###
# tests receive

# test mutation
def test_should_fail_short_payload(
        app_client: TestClient):

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload="0x")

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n
    assert len(app_client.rollup.reports) == last_report_n + 1

    report = app_client.rollup.reports[-1]['data']['payload']
    report_code = hex2562uint(report)
    assert report_code == STATUS_INPUT_ERROR

def test_should_fail_submit_short_gameplay(
        app_client: TestClient,
        nop_gameplay_payload: Payload):

    nop_gameplay_payload.gameplay_log = nop_gameplay_payload.gameplay_log[:-1]
    hex_payload = bytes2hex(abi.encode_model(nop_gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n
    assert len(app_client.rollup.reports) == last_report_n + 1

    report = app_client.rollup.reports[-1]['data']['payload']
    report_code = hex2562uint(report)
    assert report_code == STATUS_INPUT_ERROR

def test_should_fail_submit_long_payload(
        app_client: TestClient,
        nop_gameplay_payload: Payload):

    nop_gameplay_payload.gameplay_log = b'0' * 2097152
    hex_payload = bytes2hex(abi.encode_model(nop_gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload)

    assert not app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n
    assert len(app_client.rollup.reports) == last_report_n

def test_should_fail_submit_long_gameplay(
        app_client: TestClient,
        gameplay_payload: Payload):

    gameplay_payload.gameplay_log = b'0' * (2097152 - 352) # 2MB sub headers and outhash
    hex_payload = bytes2hex(abi.encode_model(gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n
    assert len(app_client.rollup.reports) == last_report_n + 1

    report = app_client.rollup.reports[-1]['data']['payload']
    report_code = hex2562uint(report)
    assert report_code == STATUS_INPUT_ERROR

def test_should_fail_submit_long_gameplay2(
        app_client: TestClient,
        nop_gameplay_payload: Payload):

    nop_gameplay_payload.gameplay_log = b'0' * (1048576 + 1) # 1MB + 1
    hex_payload = bytes2hex(abi.encode_model(nop_gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n
    assert len(app_client.rollup.reports) == last_report_n + 1

    report = app_client.rollup.reports[-1]['data']['payload']
    report_code = hex2562uint(report)
    assert report_code == STATUS_INPUT_ERROR

def test_should_submit_invalid_gameplay(
        app_client: TestClient,
        nop_gameplay_payload: Payload):

    nop_gameplay_payload.gameplay_log = b'\x00' + nop_gameplay_payload.gameplay_log
    hex_payload = bytes2hex(abi.encode_model(nop_gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n
    assert len(app_client.rollup.reports) == last_report_n + 1

    report = app_client.rollup.reports[-1]['data']['payload']
    report_code = hex2562uint(report)
    assert report_code == STATUS_VERIFICATION_ERROR

def test_should_submit_invalid_outhash(
        app_client: TestClient,
        nop_gameplay_payload: Payload):

    nop_gameplay_payload.outhash = NOP_GAMEPLAY_OUTHASH[:31] + b'\x00'
    hex_payload = bytes2hex(abi.encode_model(nop_gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n
    assert len(app_client.rollup.reports) == last_report_n + 1

    report = app_client.rollup.reports[-1]['data']['payload']
    report_code = hex2562uint(report)
    assert report_code == STATUS_OUTHASH_ERROR

def test_should_submit_nop_gameplay(
        app_client: TestClient,
        nop_gameplay_payload: Payload):

    hex_payload = bytes2hex(abi.encode_model(nop_gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n # + 1
    assert len(app_client.rollup.reports) == last_report_n


    # validate notice
    # score = 99983

def test_should_submit_nop_gameplay_another_user(
        app_client: TestClient,
        nop_gameplay_payload: Payload):

    hex_payload = bytes2hex(abi.encode_model(nop_gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload, msg_sender=USER2)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n # + 1
    assert len(app_client.rollup.reports) == last_report_n

    # validate notice

def test_should_submit_gameplay(
        app_client: TestClient,
        gameplay_payload: Payload):

    hex_payload = bytes2hex(abi.encode_model(gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n # + 1
    assert len(app_client.rollup.reports) == last_report_n


    # validate notice

def test_should_submit_gameplay_another_user(
        app_client: TestClient,
        gameplay_payload: Payload):

    hex_payload = bytes2hex(abi.encode_model(gameplay_payload,True))

    last_notice_n = len(app_client.rollup.notices)
    last_report_n = len(app_client.rollup.reports)
    app_client.send_advance(hex_payload=hex_payload, msg_sender=USER2)

    assert app_client.rollup.status # No reverts
    assert len(app_client.rollup.notices) == last_notice_n # + 1
    assert len(app_client.rollup.reports) == last_report_n

    # validate notice

# test inspect
def test_should_receive_inspect_no_data(app_client: TestClient):
    app_client.send_inspect(hex_payload='0x')
    assert not app_client.rollup.status

def test_should_receive_inspect_any_data(app_client: TestClient):
    app_client.send_inspect(hex_payload='0x00')
    assert not app_client.rollup.status
