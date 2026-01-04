/**
 * @description       : Unit tests for apiTester LWC.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { createElement } from "@lwc/engine-dom";
import ApiTester from "c/apiTester";

describe("c-api-tester", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  it("renders correctly", async () => {
    const element = createElement("c-api-tester", {
      is: ApiTester
    });
    document.body.appendChild(element);

    await Promise.resolve();

    // Verify component renders with core elements
    expect(element.shadowRoot).not.toBeNull();
  });

  it("renders endpoint selector", async () => {
    const element = createElement("c-api-tester", {
      is: ApiTester
    });
    document.body.appendChild(element);

    await Promise.resolve();

    const combobox = element.shadowRoot.querySelector("lightning-combobox");
    expect(combobox).not.toBeNull();
  });

  it("renders execute button", async () => {
    const element = createElement("c-api-tester", {
      is: ApiTester
    });
    document.body.appendChild(element);

    await Promise.resolve();

    const button = element.shadowRoot.querySelector("lightning-button");
    expect(button).not.toBeNull();
  });
});
