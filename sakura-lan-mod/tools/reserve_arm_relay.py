#!/usr/bin/env python3
"""Append a dedicated ELF LOAD segment without moving any game code or data."""
import struct
import sys
from pathlib import Path

MARKER = b"SAKURA_LAN_RELAY_V1\0"
ALIGN = 0x4000  # Keeps the relay separate from program headers on 4K/16K pages.
TARGET_RVA = 0x1064B48
PROLOGUE = bytes.fromhex("f04b2de9048b2ded")
PHDR = struct.Struct("<8I")


def reserve_relay(original, target_rva=TARGET_RVA, prologue=PROLOGUE):
    data = bytearray(original)
    if data[:7] != b"\x7fELF\x01\x01\x01" or struct.unpack_from("<H", data, 18)[0] != 40:
        raise ValueError("relay reservation requires a little-endian ARM32 ELF")
    phoff = struct.unpack_from("<I", data, 28)[0]
    entsize, count = struct.unpack_from("<HH", data, 42)
    if entsize != PHDR.size or not 1 <= count < 128:
        raise ValueError("unsupported program header table")
    headers = [list(PHDR.unpack_from(data, phoff + i * entsize)) for i in range(count)]
    loads = [h for h in headers if h[0] == 1]
    for h in loads:
        if h[4] >= ALIGN * 2 and data[h[1] + ALIGN:h[1] + ALIGN + len(MARKER)] == MARKER:
            return bytes(data), h[2] + ALIGN
    target_segment = next((h for h in loads if h[2] <= target_rva and
                           target_rva + len(prologue) <= h[2] + h[4]), None)
    if target_segment is None:
        raise ValueError("FadeManager.OnGUI is outside file-backed LOAD segments")
    offset = target_segment[1] + target_rva - target_segment[2]
    if data[offset:offset + len(prologue)] != prologue:
        raise ValueError("unrecognized 1.043.04 FadeManager.OnGUI prologue")
    align = lambda n: (n + ALIGN - 1) & ~(ALIGN - 1)
    file_offset = align(len(data))
    address = align(max(h[2] + h[5] for h in loads))
    relay = address + ALIGN
    distance = relay + 16 - (target_rva + 8)
    if not -0x2000000 <= distance <= 0x1FFFFFC:
        raise ValueError("reserved relay would be outside ARM branch range")
    # Relocate only the header table. Keep every original LOAD and section at
    # the same file offset and virtual address; no instruction relocation.
    headers = [h for h in headers if h[0] != 6]  # Replace/add PT_PHDR first.
    size = (len(headers) + 2) * PHDR.size
    if size > ALIGN:
        raise ValueError("program headers exceed reserved header page")
    headers.insert(0, [6, file_offset, address, address, size, size, 4, 4])
    headers.append([1, file_offset, address, address, ALIGN * 2, ALIGN * 2, 4, ALIGN])
    data.extend(bytes(file_offset + ALIGN * 2 - len(data)))
    for i, h in enumerate(headers):
        PHDR.pack_into(data, file_offset + i * PHDR.size, *h)
    data[file_offset + ALIGN:file_offset + ALIGN + len(MARKER)] = MARKER
    struct.pack_into("<I", data, 28, file_offset)
    struct.pack_into("<H", data, 44, len(headers))
    return bytes(data), relay


if __name__ == "__main__":
    path = Path(sys.argv[1])
    patched, relay = reserve_relay(path.read_bytes())
    path.write_bytes(patched)
    print(f"Reserved ARM relay RVA={relay:#x}, target RVA={TARGET_RVA:#x}")
