import { encodeWav } from "../stt/wav";
import { floatToPcm16 } from "../stt/pcm-capture";

/** jsdom's Blob may lack arrayBuffer(), so read through FileReader. */
function readBlob(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("stt wav / pcm helpers", () => {
  it("encodes a 16-bit mono WAV header", async () => {
    const blob = encodeWav(new Float32Array([0, 0.5, -1, 1]), 16000);
    const v = new DataView(await readBlob(blob));
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(44 + 4 * 2);
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe("RIFF");
    expect(v.getUint16(22, true)).toBe(1); // channels
    expect(v.getUint32(24, true)).toBe(16000); // sample rate
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(v.getUint32(40, true)).toBe(8); // data bytes
    expect(v.getInt16(44 + 2 * 2, true)).toBe(-32767);
  });

  it("clamps out-of-range samples", () => {
    expect(Array.from(floatToPcm16(new Float32Array([2, -2])))).toEqual([32767, -32767]);
  });
});
