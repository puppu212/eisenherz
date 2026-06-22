export const FLOW_SCREEN = Object.freeze({
  BOOT: "boot",
  TITLE: "title",
  SCENARIO: "scenario",
  LOADING: "loading",
  STRATEGY: "strategy",
  BATTLE: "battle",
  CLEAR: "clear",
});

export const FLOW_EVENT = Object.freeze({
  BOOT_READY: "boot-ready",
  CHOOSE_DIFFICULTY: "choose-difficulty",
  START_SCENARIO: "start-scenario",
  FINISH_LOADING: "finish-loading",
  START_BATTLE: "start-battle",
  FINISH_BATTLE: "finish-battle",
  CLEAR_SCENARIO: "clear-scenario",
  RETURN_SCENARIOS: "return-scenarios",
  BACK: "back",
});

const TRANSITIONS = Object.freeze({
  [FLOW_SCREEN.BOOT]: Object.freeze({
    [FLOW_EVENT.BOOT_READY]: FLOW_SCREEN.TITLE,
  }),
  [FLOW_SCREEN.TITLE]: Object.freeze({
    [FLOW_EVENT.CHOOSE_DIFFICULTY]: FLOW_SCREEN.SCENARIO,
  }),
  [FLOW_SCREEN.SCENARIO]: Object.freeze({
    [FLOW_EVENT.START_SCENARIO]: FLOW_SCREEN.LOADING,
    [FLOW_EVENT.BACK]: FLOW_SCREEN.TITLE,
  }),
  [FLOW_SCREEN.LOADING]: Object.freeze({
    [FLOW_EVENT.FINISH_LOADING]: FLOW_SCREEN.STRATEGY,
  }),
  [FLOW_SCREEN.STRATEGY]: Object.freeze({
    [FLOW_EVENT.START_BATTLE]: FLOW_SCREEN.BATTLE,
    [FLOW_EVENT.CLEAR_SCENARIO]: FLOW_SCREEN.CLEAR,
    [FLOW_EVENT.RETURN_SCENARIOS]: FLOW_SCREEN.SCENARIO,
    [FLOW_EVENT.BACK]: FLOW_SCREEN.SCENARIO,
  }),
  [FLOW_SCREEN.BATTLE]: Object.freeze({
    [FLOW_EVENT.FINISH_BATTLE]: FLOW_SCREEN.STRATEGY,
  }),
  [FLOW_SCREEN.CLEAR]: Object.freeze({
    [FLOW_EVENT.RETURN_SCENARIOS]: FLOW_SCREEN.SCENARIO,
  }),
});

export function createGameFlow() {
  return Object.freeze({
    screen: FLOW_SCREEN.BOOT,
    difficulty: "easy",
    scenarioId: null,
  });
}

export function transitionGameFlow(flow, event, payload = {}) {
  const nextScreen = TRANSITIONS[flow.screen]?.[event];
  if (!nextScreen) {
    throw new Error(`Invalid game flow transition: ${flow.screen} -> ${event}`);
  }

  return Object.freeze({
    ...flow,
    screen: nextScreen,
    difficulty: event === FLOW_EVENT.CHOOSE_DIFFICULTY
      ? payload.difficulty ?? "easy"
      : flow.difficulty,
    scenarioId: event === FLOW_EVENT.START_SCENARIO
      ? payload.scenarioId ?? flow.scenarioId
      : flow.scenarioId,
  });
}

export function canTransitionGameFlow(flow, event) {
  return Boolean(TRANSITIONS[flow.screen]?.[event]);
}
