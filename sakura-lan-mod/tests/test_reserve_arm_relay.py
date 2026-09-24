import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from reserve_arm_relay import ALIGN, MARKER, PHDR, PROLOGUE, reserve_relay


class RelayReservationTest(unittest.TestCase):
    def fixture(self, with_phdr):
        headers = [[1, 0, 0, 0, 0x1000, 0x1000, 5, 0x1000],
                   [1, 0x1000, 0x5000, 0x5000, 0x1000, 0x3000, 6, 0x1000]]
        if with_phdr:
            headers.insert(0, [6, 52, 52, 52, 3 * 32, 3 * 32, 4, 4])
        data = bytearray(0x2100)
        ident = b"\x7fELF\x01\x01\x01" + bytes(9)
        struct.pack_into("<16sHHIIIIIHHHHHH", data, 0, ident, 3, 40, 1,
                         0, 52, 0, 0, 52, 32, len(headers), 40, 0, 0)
        for i, h in enumerate(headers):
            PHDR.pack_into(data, 52 + i * 32, *h)
        data[0x300:0x308] = PROLOGUE
        data[0x1100:0x1104] = b"DATA"
        return data, headers

    def test_preserves_load_addresses_and_contents(self):
        for existing in (False, True):
            with self.subTest(existing_phdr=existing):
                original, old_headers = self.fixture(existing)
                patched, address = reserve_relay(original, 0x300)
                phoff = struct.unpack_from("<I", patched, 28)[0]
                count = struct.unpack_from("<H", patched, 44)[0]
                headers = [list(PHDR.unpack_from(patched, phoff + i * 32)) for i in range(count)]
                self.assertEqual([h for h in headers if h[0] == 1][:-1],
                                 [h for h in old_headers if h[0] == 1])
                self.assertEqual(patched[52:len(original)], original[52:])
                self.assertEqual(patched[phoff + ALIGN:phoff + ALIGN + len(MARKER)], MARKER)
                self.assertEqual(address, headers[-1][2] + ALIGN)
                self.assertEqual(headers[0][0], 6)
                self.assertEqual(headers[0][2], headers[-1][2])
                self.assertEqual(reserve_relay(patched, 0x300), (patched, address))

    def test_rejects_unrecognized_game_code(self):
        original, _ = self.fixture(False)
        with self.assertRaisesRegex(ValueError, "prologue"):
            reserve_relay(original, 0x301)


if __name__ == "__main__":
    unittest.main()
