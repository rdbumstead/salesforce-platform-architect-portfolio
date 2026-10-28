import { limitState, NEAR_MINIMUM } from "c/fieldLimit";

describe("c/fieldLimit", () => {
  it("counts against the limit with thousands grouped", () => {
    expect(limitState("x".repeat(1234), 12000)).toEqual({
      text: "1,234 of 12,000 characters",
      isNear: false,
      isFull: false,
      className: "field-limit"
    });
  });

  it("says how many are left once within a tenth of the limit", () => {
    const state = limitState("x".repeat(11000), 12000);
    expect(state.text).toBe("11,000 of 12,000 characters, 1,000 left");
    expect(state.isNear).toBe(true);
    expect(state.className).toBe("field-limit field-limit_near");
  });

  it("counts a short box as near within the minimum, whatever the share", () => {
    const max = 80;
    expect(limitState("x".repeat(max - NEAR_MINIMUM - 1), max).isNear).toBe(
      false
    );
    expect(limitState("x".repeat(max - NEAR_MINIMUM), max).text).toBe(
      `${max - NEAR_MINIMUM} of ${max} characters, ${NEAR_MINIMUM} left`
    );
  });

  it("says the limit is reached at the limit", () => {
    const state = limitState("x".repeat(255), 255);
    expect(state.text).toBe("255 of 255 characters, limit reached");
    expect(state.isFull).toBe(true);
    expect(state.isNear).toBe(true);
  });

  it("treats an empty or missing value as nothing typed", () => {
    expect(limitState("", 120).text).toBe("0 of 120 characters");
    expect(limitState(undefined, 120).text).toBe("0 of 120 characters");
  });
});
