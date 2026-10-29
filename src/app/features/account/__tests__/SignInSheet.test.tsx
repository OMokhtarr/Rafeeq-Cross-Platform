import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route } from "react-router-dom";
import SignInSheet from "../SignInSheet";
import { useAuth } from "../../../core/context/AuthContext";
import { isAppleSignInOn } from "../../../core/services/auth/accounts-switch";
import { closeTopOverlay } from "../../../core/utils/overlay-registry";

const mockPresentToast = jest.fn();
jest.mock("@ionic/react", () => ({ useIonToast: () => [mockPresentToast] }));
jest.mock("../../../core/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../../core/services/auth/accounts-switch", () => ({ isAppleSignInOn: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signIn = jest.fn();
const closeSignIn = jest.fn();
let historyRef: { push: (p: string) => void } | null = null;
let host: HTMLDivElement;
let root: Root;

function mount(signInOpen: boolean, apple = false) {
  (useAuth as jest.Mock).mockReturnValue({ signInOpen, signIn, closeSignIn });
  (isAppleSignInOn as jest.Mock).mockReturnValue(apple);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={["/account"]}>
        <SignInSheet />
        <Route
          path="*"
          render={({ history }) => {
            historyRef = history;
            return null;
          }}
        />
      </MemoryRouter>,
    ),
  );
}

const button = (text: string) =>
  Array.from(host.querySelectorAll("button")).find((b) => b.textContent?.includes(text));

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("renders nothing while closed and does not take Back", () => {
  mount(false);
  expect(host.textContent).toBe("");
  expect(closeTopOverlay()).toBe(false);
});

it("offers Google, and Apple only when Apple sign-in is on", () => {
  mount(true, false);
  expect(button("المتابعة عبر Google")).toBeDefined();
  expect(button("المتابعة عبر Apple")).toBeUndefined();
  act(() => root.unmount());
  host.remove();
  mount(true, true);
  expect(button("المتابعة عبر Apple")).toBeDefined();
});

it("signs in with the tapped provider", async () => {
  signIn.mockResolvedValue("signed_in");
  mount(true, true);
  await act(async () => button("المتابعة عبر Google")!.click());
  expect(signIn).toHaveBeenCalledWith("google");
  await act(async () => button("المتابعة عبر Apple")!.click());
  expect(signIn).toHaveBeenCalledWith("apple");
  expect(mockPresentToast).not.toHaveBeenCalled();
  expect(closeSignIn).not.toHaveBeenCalled();
});

it("stays open silently when the person cancels the provider", async () => {
  signIn.mockResolvedValue("cancelled");
  mount(true);
  await act(async () => button("المتابعة عبر Google")!.click());
  expect(mockPresentToast).not.toHaveBeenCalled();
  expect(closeSignIn).not.toHaveBeenCalled();
});

it("toasts and stays open when sign-in fails", async () => {
  signIn.mockResolvedValue("failed");
  mount(true);
  await act(async () => button("المتابعة عبر Google")!.click());
  expect(mockPresentToast).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining("تعذّر") }),
  );
  expect(closeSignIn).not.toHaveBeenCalled();
});

it("closes from the backdrop, the close button, Back and a route change", () => {
  mount(true);
  act(() => (host.querySelector(".signin-backdrop") as HTMLElement).click());
  expect(closeSignIn).toHaveBeenCalledTimes(1);
  act(() => (host.querySelector(".signin-close") as HTMLElement).click());
  expect(closeSignIn).toHaveBeenCalledTimes(2);
  expect(closeTopOverlay()).toBe(true);
  expect(closeSignIn).toHaveBeenCalledTimes(3);
  act(() => historyRef!.push("/quiz-list"));
  expect(closeSignIn).toHaveBeenCalledTimes(4);
});
