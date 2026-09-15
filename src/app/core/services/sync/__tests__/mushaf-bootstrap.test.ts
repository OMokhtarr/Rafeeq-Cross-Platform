/**
 * Bringing the V4 layout under Content Sync on first run.
 *
 * Unlike tafsirs and recitations this is not user-selected — every reader of
 * the default mushaf needs it — so nothing in the UI would ever trigger the
 * bootstrap. It has to be kicked off from the app lifecycle instead.
 */

import { ensureMushafLayoutTracked } from "../mushaf-bootstrap";
import { isTracked } from "../sync-state.service";
import { bootstrapResource } from "../content-sync.service";

jest.mock("../sync-state.service", () => ({ isTracked: jest.fn() }));
jest.mock("../content-sync.service", () => ({
  bootstrapResource: jest.fn(),
  registerAdapter: jest.fn(),
}));

const mockIsTracked = isTracked as jest.MockedFunction<typeof isTracked>;
const mockBootstrap = bootstrapResource as jest.MockedFunction<
  typeof bootstrapResource
>;

beforeEach(() => {
  mockIsTracked.mockReset();
  mockBootstrap.mockReset();
  mockBootstrap.mockResolvedValue(undefined);
});

describe("ensureMushafLayoutTracked", () => {
  it("bootstraps mushafs:19 when it is not yet tracked", async () => {
    mockIsTracked.mockResolvedValue(false);

    await ensureMushafLayoutTracked();

    expect(mockBootstrap).toHaveBeenCalledWith("mushafs", 19);
  });

  it("does nothing when already tracked", async () => {
    // The snapshot is 23 MB; re-fetching it on every launch would be brutal.
    mockIsTracked.mockResolvedValue(true);

    await ensureMushafLayoutTracked();

    expect(mockBootstrap).not.toHaveBeenCalled();
  });

  it("never rejects when the bootstrap fails", async () => {
    // Very plausible offline on a cold start. getPage() falls back to the API,
    // and the next run retries, so this must not surface as an error.
    mockIsTracked.mockResolvedValue(false);
    mockBootstrap.mockRejectedValue(new Error("offline"));

    await expect(ensureMushafLayoutTracked()).resolves.toBeUndefined();
  });

  it("never rejects when the tracked check fails", async () => {
    mockIsTracked.mockRejectedValue(new Error("idb unavailable"));

    await expect(ensureMushafLayoutTracked()).resolves.toBeUndefined();
    expect(mockBootstrap).not.toHaveBeenCalled();
  });

  it("does not start a second bootstrap while one is in flight", async () => {
    // Cold start and a resume can fire together; two concurrent 23 MB
    // snapshot fetches would be a real cost on a phone.
    mockIsTracked.mockResolvedValue(false);
    let release: () => void = () => {};
    const started = new Promise<void>((resolveStarted) => {
      mockBootstrap.mockImplementation(() => {
        resolveStarted();
        return new Promise<void>((r) => {
          release = r;
        });
      });
    });

    const a = ensureMushafLayoutTracked();
    await started; // the first call is now parked inside bootstrapResource
    const b = ensureMushafLayoutTracked();
    release();
    await Promise.all([a, b]);

    expect(mockBootstrap).toHaveBeenCalledTimes(1);
  });
});
