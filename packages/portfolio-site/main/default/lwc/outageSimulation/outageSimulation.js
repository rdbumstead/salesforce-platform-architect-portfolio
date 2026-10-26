/**
 * @description       : The Delivery page's "Simulate an outage" switch, kept in one place so one
 *                      switch drives every panel that reads a cached feed. The roadmap holds the
 *                      switch, and the roadmap and Latest Updates both listen. The value lives
 *                      for the page view only and starts off. A listener that throws never stops
 *                      the others.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/26/2026
 **/

let simulating = false;
const listeners = new Set();

/**
 * Whether the outage simulation is on.
 * @returns {boolean} true while the switch is on
 */
export function isSimulating() {
  return simulating;
}

/**
 * Turns the simulation on or off and tells every listener.
 * @param {boolean} value the new state
 */
export function setSimulating(value) {
  simulating = Boolean(value);
  listeners.forEach((listener) => {
    try {
      listener(simulating);
    } catch {
      // One bad listener must not stop the rest.
    }
  });
}

/**
 * Calls back with the new state whenever it changes.
 * @param {Function} listener called with true or false
 * @returns {Function} call it to stop listening
 */
export function onSimulatingChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
