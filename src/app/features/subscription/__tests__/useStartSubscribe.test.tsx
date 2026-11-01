import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { useSignedInAction, useStartSubscribe } from "../useStartSubscribe";
import { useAuth } from "../../../core/context/AuthContext";
import { isAccountsOn } from "../../../core/services/auth/accounts-switch";

jest.mock("../../../core/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../../core/services/auth/accounts-switch", () => ({ isAccountsOn: jest.fn() }));
const mockOpenPaywall = jest.fn();
jest.mock("../usePaywall", () => ({ usePaywall: () => mockOpenPaywall }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const requestSignIn = jest.fn();
let host: HTMLDivElement;
let root: Root;
let start: () => Promise<void>;
let guard: (action: () => void | Promise<void>) => Promise<void>;

const Probe: React.FC = () => {
  start = useStartSubscribe();
  guard = useSignedInAction();
  return null;
};

function mount(auth: { enabled: boolean; user: object | null }) {
  (useAuth as jest.Mock).mockReturnValue({ ...auth, requestSignIn });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<Probe />));
}

beforeEach(() => {
  (isAccountsOn as jest.Mock).mockReturnValue(true);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("useStartSubscribe", () => {
  it("opens the paywall only after sign-in succeeds", async () => {
    let finish!: (v: boolean) => void;
    requestSignIn.mockReturnValue(new Promise<boolean>((r) => (finish = r)));
    mount({ enabled: true, user: null });
    let done!: Promise<void>;
    await act(async () => {
      done = start();
    });
    expect(requestSignIn).toHaveBeenCalledTimes(1);
    expect(mockOpenPaywall).not.toHaveBeenCalled();
    await act(async () => {
      finish(true);
      await done;
    });
    expect(mockOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it("opens no paywall when sign-in is dismissed", async () => {
    requestSignIn.mockResolvedValue(false);
    mount({ enabled: true, user: null });
    await act(async () => start());
    expect(mockOpenPaywall).not.toHaveBeenCalled();
  });

  it("opens the paywall directly when signed in", async () => {
    mount({ enabled: true, user: { id: "u" } });
    await act(async () => start());
    expect(requestSignIn).not.toHaveBeenCalled();
    expect(mockOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it("opens the paywall directly when accounts are switched off", async () => {
    (isAccountsOn as jest.Mock).mockReturnValue(false);
    mount({ enabled: false, user: null });
    await act(async () => start());
    expect(requestSignIn).not.toHaveBeenCalled();
    expect(mockOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it("opens no paywall when accounts are on but sign-in isn't configured", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    mount({ enabled: false, user: null });
    await act(async () => start());
    expect(requestSignIn).not.toHaveBeenCalled();
    expect(mockOpenPaywall).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("useSignedInAction", () => {
  it("runs the action after sign-in, and not when dismissed", async () => {
    const action = jest.fn();
    mount({ enabled: true, user: null });
    requestSignIn.mockResolvedValueOnce(false);
    await act(async () => guard(action));
    expect(action).not.toHaveBeenCalled();
    requestSignIn.mockResolvedValueOnce(true);
    await act(async () => guard(action));
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("runs the action directly when signed in", async () => {
    const action = jest.fn();
    mount({ enabled: true, user: { id: "u" } });
    await act(async () => guard(action));
    expect(requestSignIn).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });
});
