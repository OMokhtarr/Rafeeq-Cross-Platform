import {
  NOT_SUBSCRIBED_MESSAGE,
  STT_UNAVAILABLE_MESSAGE,
  brokerHeaders,
  fetchBrokerKey,
  setBrokerTokenSource,
} from "../stt/broker";

const fetchMock = jest.fn();
const realFetch = global.fetch;
const realUrl = process.env.REACT_APP_TOKEN_BROKER_URL;

beforeAll(() => {
  process.env.REACT_APP_TOKEN_BROKER_URL = "https://broker.test";
});
afterAll(() => {
  process.env.REACT_APP_TOKEN_BROKER_URL = realUrl;
});
beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  setBrokerTokenSource(null);
});
afterEach(() => {
  global.fetch = realFetch;
});

const respond = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });

describe("the account token", () => {
  it("sends no auth header without a token source", async () => {
    respond(200, { access_token: "tok" });
    await expect(fetchBrokerKey("/soniox/token")).resolves.toBe("tok");
    expect(fetchMock).toHaveBeenCalledWith("https://broker.test/soniox/token", { method: "POST", headers: {} });
  });

  it("sends the token as a bearer authorization header", async () => {
    setBrokerTokenSource(async () => "tok");
    respond(200, { access_token: "tok2" });
    await expect(fetchBrokerKey("/soniox/token")).resolves.toBe("tok2");
    expect(fetchMock).toHaveBeenCalledWith("https://broker.test/soniox/token", {
      method: "POST",
      headers: { authorization: "Bearer tok" },
    });
  });

  it("sends no auth header when the source yields null", async () => {
    setBrokerTokenSource(async () => null);
    expect(await brokerHeaders()).toEqual({});
  });

  it("treats a source that throws as no token", async () => {
    setBrokerTokenSource(async () => {
      throw new Error("refresh failed");
    });
    respond(200, { access_token: "tok" });
    await expect(fetchBrokerKey("/soniox/token")).resolves.toBe("tok");
    expect(fetchMock).toHaveBeenCalledWith("https://broker.test/soniox/token", { method: "POST", headers: {} });
  });

  it("stops sending the token once the source is cleared", async () => {
    setBrokerTokenSource(async () => "tok");
    setBrokerTokenSource(null);
    expect(await brokerHeaders()).toEqual({});
  });
});

it("maps a 402 to NOT_SUBSCRIBED_MESSAGE", async () => {
  respond(402, { error: "subscription required", code: "not_subscribed" });
  await expect(fetchBrokerKey("/deepgram/token")).rejects.toThrow(NOT_SUBSCRIBED_MESSAGE);
});

it("keeps the 503 message", async () => {
  respond(503);
  await expect(fetchBrokerKey("/deepgram/token")).rejects.toThrow(STT_UNAVAILABLE_MESSAGE);
});
