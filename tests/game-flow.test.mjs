import assert from "node:assert/strict";
import test from "node:test";

import {
  FLOW_EVENT,
  FLOW_SCREEN,
  canTransitionGameFlow,
  createGameFlow,
  transitionGameFlow,
} from "../src/game-flow.js";

test("the complete game flow reaches scenario clear", () => {
  let flow = createGameFlow();
  assert.equal(flow.screen, FLOW_SCREEN.BOOT);

  flow = transitionGameFlow(flow, FLOW_EVENT.BOOT_READY);
  flow = transitionGameFlow(flow, FLOW_EVENT.CHOOSE_DIFFICULTY, { difficulty: "hard" });
  flow = transitionGameFlow(flow, FLOW_EVENT.START_SCENARIO, { scenarioId: "demo" });
  assert.equal(flow.screen, FLOW_SCREEN.FACTION);
  flow = transitionGameFlow(flow, FLOW_EVENT.CHOOSE_FACTION, { factionId: "deutschland" });
  flow = transitionGameFlow(flow, FLOW_EVENT.FINISH_LOADING);
  flow = transitionGameFlow(flow, FLOW_EVENT.START_BATTLE);
  flow = transitionGameFlow(flow, FLOW_EVENT.FINISH_BATTLE);
  flow = transitionGameFlow(flow, FLOW_EVENT.CLEAR_SCENARIO);

  assert.deepEqual(flow, {
    screen: FLOW_SCREEN.CLEAR,
    difficulty: "hard",
    scenarioId: "demo",
    factionId: "deutschland",
  });
});

test("back navigation is explicit at front and strategy screens", () => {
  let flow = transitionGameFlow(createGameFlow(), FLOW_EVENT.BOOT_READY);
  flow = transitionGameFlow(flow, FLOW_EVENT.CHOOSE_DIFFICULTY);
  flow = transitionGameFlow(flow, FLOW_EVENT.BACK);
  assert.equal(flow.screen, FLOW_SCREEN.TITLE);

  flow = transitionGameFlow(flow, FLOW_EVENT.CHOOSE_DIFFICULTY);
  flow = transitionGameFlow(flow, FLOW_EVENT.START_SCENARIO, { scenarioId: "demo" });
  flow = transitionGameFlow(flow, FLOW_EVENT.BACK);
  assert.equal(flow.screen, FLOW_SCREEN.SCENARIO);
  assert.equal(flow.scenarioId, null);
  assert.equal(flow.factionId, null);

  flow = transitionGameFlow(flow, FLOW_EVENT.START_SCENARIO, { scenarioId: "demo" });
  flow = transitionGameFlow(flow, FLOW_EVENT.CHOOSE_FACTION, { factionId: "deutschland" });
  flow = transitionGameFlow(flow, FLOW_EVENT.FINISH_LOADING);
  flow = transitionGameFlow(flow, FLOW_EVENT.BACK);
  assert.equal(flow.screen, FLOW_SCREEN.SCENARIO);
  assert.equal(flow.scenarioId, null);
  assert.equal(flow.factionId, null);
});

test("returning after scenario clear resets started scenario metadata", () => {
  let flow = transitionGameFlow(createGameFlow(), FLOW_EVENT.BOOT_READY);
  flow = transitionGameFlow(flow, FLOW_EVENT.CHOOSE_DIFFICULTY, { difficulty: "hard" });
  flow = transitionGameFlow(flow, FLOW_EVENT.START_SCENARIO, { scenarioId: "demo" });
  flow = transitionGameFlow(flow, FLOW_EVENT.CHOOSE_FACTION, { factionId: "deutschland" });
  flow = transitionGameFlow(flow, FLOW_EVENT.FINISH_LOADING);
  flow = transitionGameFlow(flow, FLOW_EVENT.CLEAR_SCENARIO);
  flow = transitionGameFlow(flow, FLOW_EVENT.RETURN_SCENARIOS);

  assert.deepEqual(flow, {
    screen: FLOW_SCREEN.SCENARIO,
    difficulty: "hard",
    scenarioId: null,
    factionId: null,
  });
});

test("invalid jumps are rejected", () => {
  const flow = createGameFlow();
  assert.equal(canTransitionGameFlow(flow, FLOW_EVENT.START_BATTLE), false);
  assert.throws(
    () => transitionGameFlow(flow, FLOW_EVENT.START_BATTLE),
    /Invalid game flow transition: boot -> start-battle/
  );
});
