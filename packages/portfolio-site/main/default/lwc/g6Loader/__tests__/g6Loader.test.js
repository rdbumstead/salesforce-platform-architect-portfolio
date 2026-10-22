/**
 * @description       : Unit tests for the g6Loader service module.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/

// config/jest.config.js maps every lightning/* import to one universal mock
// component, so the resource loader is mocked here explicitly.
jest.mock(
  "lightning/platformResourceLoader",
  () => ({ loadScript: jest.fn(), loadStyle: jest.fn() }),
  { virtual: true }
);

const FAKE_G6 = { Graph: function Graph() {} };

// Each test gets a fresh module so the page level promise cache starts empty.
function freshModules() {
  let loader;
  let resourceLoader;
  jest.isolateModules(() => {
    resourceLoader = require("lightning/platformResourceLoader");
    loader = require("c/g6Loader");
  });
  return { loadG6: loader.loadG6, loadScript: resourceLoader.loadScript };
}

describe("c/g6Loader", () => {
  afterEach(() => {
    delete window.G6;
    jest.clearAllMocks();
  });

  it("loads G6_Library once for two calls and resolves both to the G6 global", async () => {
    const { loadG6, loadScript } = freshModules();
    loadScript.mockImplementation(() => {
      window.G6 = FAKE_G6;
      return Promise.resolve();
    });
    const component = {};

    const [first, second] = await Promise.all([
      loadG6(component),
      loadG6(component)
    ]);
    const third = await loadG6(component);

    expect(loadScript).toHaveBeenCalledTimes(1);
    expect(loadScript).toHaveBeenCalledWith(component, "G6_Library");
    expect(first).toBe(FAKE_G6);
    expect(second).toBe(FAKE_G6);
    expect(third).toBe(FAKE_G6);
  });

  it("rejects with a clear Error when the script fails to load", async () => {
    const { loadG6, loadScript } = freshModules();
    loadScript.mockRejectedValue(new Error("network down"));

    await expect(loadG6({})).rejects.toThrow(
      "G6_Library failed to load: network down"
    );
  });

  it("rejects when the script loads but exposes no G6.Graph", async () => {
    const { loadG6, loadScript } = freshModules();
    loadScript.mockResolvedValue();

    await expect(loadG6({})).rejects.toThrow(
      "G6_Library loaded but no G6.Graph constructor was found"
    );
  });

  it("does not cache a failure, so a later call tries again", async () => {
    const { loadG6, loadScript } = freshModules();
    loadScript
      .mockRejectedValueOnce(new Error("blocked"))
      .mockImplementation(() => {
        window.G6 = FAKE_G6;
        return Promise.resolve();
      });

    await expect(loadG6({})).rejects.toThrow("blocked");
    await expect(loadG6({})).resolves.toBe(FAKE_G6);
    expect(loadScript).toHaveBeenCalledTimes(2);
  });
});
