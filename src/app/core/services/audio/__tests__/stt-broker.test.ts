import {
  NOT_SUBSCRIBED_MESSAGE,
  STT_UNAVAILABLE_MESSAGE,
  brokerHeaders,
  fetchBrokerKey,
  setBrokerUserId,
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
  setBrokerUserId(null);
});
afterEach(() => {
  global.fetch = realFetch;
});

const respond = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValue({ ok: status < 300, status, json: async () => body });

it("sends no identity header until an id is set", () => {
  expect(brokerHeaders()).toEqual({});
});

it("sends x-rafeeq-user when an id is set", async () => {
  setBrokerUserId("$RCAnonymousID:abc");
  respond(200, { access_token: "tok" });
  await expect(fetchBrokerKey("/soniox/token")).resolves.toBe("tok");
  expect(fetchMock).toHaveBeenCalledWith("https://broker.test/soniox/token", {
    method: "POST",
    headers: { "x-rafeeq-user": "$RCAnonymousID:abc" },
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
