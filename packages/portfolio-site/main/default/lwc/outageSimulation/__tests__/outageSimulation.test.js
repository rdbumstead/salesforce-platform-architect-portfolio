/**
 * @description       : Unit tests for the shared simulate an outage state.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/
import {
  isSimulating,
  setSimulating,
  onSimulatingChange
} from "c/outageSimulation";

describe("c/outageSimulation", () => {
  afterEach(() => setSimulating(false));

  it("starts off and tells every listener when it changes", () => {
    const first = jest.fn();
    const second = jest.fn();
    const stopFirst = onSimulatingChange(first);
    onSimulatingChange(second);
    expect(isSimulating()).toBe(false);
    setSimulating(true);
    expect(isSimulating()).toBe(true);
    expect(first).toHaveBeenCalledWith(true);
    expect(second).toHaveBeenCalledWith(true);
    stopFirst();
    setSimulating(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith(false);
  });

  it("keeps telling the others when one listener throws", () => {
    const after = jest.fn();
    onSimulatingChange(() => {
      throw new Error("bad listener");
    });
    onSimulatingChange(after);
    setSimulating(true);
    expect(after).toHaveBeenCalledWith(true);
  });
});
