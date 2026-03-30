// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const testState = vi.hoisted(() => ({
  sceneConfig: {
    selectedVrmIndex: 1,
    customVrmUrl: "",
    uiTheme: "light",
    tab: "chat",
    companionVrmPowerMode: "balanced",
    companion3dOff: false,
    companionHalfFramerateMode: "when_saving_power",
    companionAnimateWhenHidden: false,
  },
  vrmStageProps: null as Record<string, unknown> | null,
}));

vi.mock("@miladyai/app-core/hooks", () => ({
  useRenderGuard: vi.fn(),
}));

vi.mock("@miladyai/app-core/state", () => ({
  getVrmPreviewUrl: () => "/vrms/previews/milady-1.png",
  getVrmUrl: () => "/vrms/milady-1.vrm.gz",
  VRM_COUNT: 24,
  useCompanionSceneConfig: () => testState.sceneConfig,
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@miladyai/app-core/utils", () => ({
  resolveAppAssetUrl: (value: string) => value,
}));

vi.mock("../../src/components/VrmStage", () => ({
  VrmStage: (props: Record<string, unknown>) => {
    testState.vrmStageProps = props;
    return React.createElement("div", { "data-testid": "companion-vrm-stage" });
  },
}));

import { CompanionSceneHost } from "../../src/components/CompanionSceneHost";

function createCompanionRootMock() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

describe("CompanionSceneHost", () => {
  beforeEach(() => {
    testState.sceneConfig = {
      selectedVrmIndex: 1,
      customVrmUrl: "",
      uiTheme: "light",
      tab: "chat",
      companionVrmPowerMode: "balanced",
      companion3dOff: false,
      companionHalfFramerateMode: "when_saving_power",
      companionAnimateWhenHidden: false,
    };
    testState.vrmStageProps = null;

    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    Object.defineProperty(globalThis, "window", {
      value: {
        innerWidth: 1440,
        innerHeight: 900,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
    });
  });

  it("binds drag capture handlers to the root companion shell", () => {
    const rootMock = createCompanionRootMock();
    let tree: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      tree = TestRenderer.create(
        <CompanionSceneHost active>
          <div data-testid="companion-child">child</div>
        </CompanionSceneHost>,
        {
          createNodeMock: (element) =>
            element.props?.["data-testid"] === "companion-root"
              ? rootMock
              : null,
        },
      );
    });

    const root = tree?.root.findByProps({ "data-testid": "companion-root" });

    expect(typeof root.props.onPointerDownCapture).toBe("function");
    expect(typeof root.props.onPointerMoveCapture).toBe("function");
    expect(typeof root.props.onPointerUpCapture).toBe("function");
    expect(rootMock.addEventListener).toHaveBeenCalledWith(
      "wheel",
      expect.any(Function),
      { capture: true, passive: false },
    );
  });

  it("omits the world scene in low_res mode", () => {
    testState.sceneConfig.companionVrmPowerMode = "low_res";

    act(() => {
      TestRenderer.create(
        <CompanionSceneHost active>
          <div data-testid="companion-child">child</div>
        </CompanionSceneHost>,
      );
    });

    expect(testState.vrmStageProps?.worldUrl).toBeUndefined();
  });

  it("shows a static preview instead of mounting VrmStage when 3d is off", () => {
    testState.sceneConfig.companion3dOff = true;
    let tree: TestRenderer.ReactTestRenderer | undefined;

    act(() => {
      tree = TestRenderer.create(
        <CompanionSceneHost active>
          <div data-testid="companion-child">child</div>
        </CompanionSceneHost>,
      );
    });

    expect(tree?.root.findAllByProps({ "data-testid": "companion-vrm-stage" })).toHaveLength(0);
    const previewImages = tree?.root.findAllByType("img") ?? [];
    expect(previewImages).toHaveLength(1);
    expect(previewImages[0]?.props.src).toBe("/vrms/previews/milady-1.png");
  });
});
