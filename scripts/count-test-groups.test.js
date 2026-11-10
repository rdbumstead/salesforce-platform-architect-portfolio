const test = require("node:test");
const assert = require("node:assert");
const {
  countApexMethods,
  collectJest,
  assignGroups,
  renderFile,
  withoutDate
} = require("./count-test-groups");

test("counts annotated methods in both spellings and with arguments", () => {
  const source = `
    @IsTest
    private class Sample {
      @IsTest static void one() {}
      @isTest
      private static void two() {}
      @IsTest(SeeAllData=true) static void three() {}
      static testMethod void four() {}
    }`;
  assert.strictEqual(countApexMethods(source), 4);
});

test("does not count the class annotation, helpers, comments or strings", () => {
  const source = `
    @IsTest
    public class Sample {
      // @IsTest static void commented() {}
      /* @IsTest static void blocked() {} */
      private static String text = '@IsTest static void quoted() {}';
      private static void helper() {}
      @TestSetup static void setup() {}
      @IsTest static void real() {}
    }`;
  assert.strictEqual(countApexMethods(source), 1);
});

test("counts a method in an inner class", () => {
  const source = `
    public class Outer {
      @IsTest private class Inner {
        @IsTest static void inside() {}
      }
    }`;
  assert.strictEqual(countApexMethods(source), 1);
});

const apexGroups = [
  { name: "First", classes: ["AlphaTest", "Beta*"] },
  { name: "Second", classes: ["GammaTest"] }
];

test("adds each item to its group and lists the largest group first", () => {
  const items = [
    { id: "AlphaTest", file: "a/AlphaTest.cls", tests: 2 },
    { id: "BetaOneTest", file: "a/BetaOneTest.cls", tests: 3 },
    { id: "GammaTest", file: "a/GammaTest.cls", tests: 9 }
  ];
  const result = assignGroups(items, apexGroups, "classes", "map.json");
  assert.deepStrictEqual(result.problems, []);
  assert.deepStrictEqual(result.groups, [
    { name: "Second", tests: 9 },
    { name: "First", tests: 5 }
  ]);
});

test("fails naming the file when a class is in no group", () => {
  const items = [
    { id: "AlphaTest", file: "a/AlphaTest.cls", tests: 2 },
    { id: "GammaTest", file: "a/GammaTest.cls", tests: 1 },
    { id: "LostTest", file: "packages/x/classes/LostTest.cls", tests: 1 }
  ];
  const result = assignGroups(items, apexGroups, "classes", "map.json");
  assert.strictEqual(result.problems.length, 2);
  assert.match(
    result.problems[0],
    /packages\/x\/classes\/LostTest\.cls .* in no group/
  );
});

test("fails naming the file when a class is in two groups", () => {
  const groups = [
    { name: "First", classes: ["AlphaTest"] },
    { name: "Second", classes: ["Alpha*"] }
  ];
  const items = [{ id: "AlphaTest", file: "a/AlphaTest.cls", tests: 1 }];
  const result = assignGroups(items, groups, "classes", "map.json");
  assert.strictEqual(result.problems.length, 1);
  assert.match(result.problems[0], /a\/AlphaTest\.cls .* more than one group/);
});

test("fails when a pattern matches nothing", () => {
  const items = [{ id: "AlphaTest", file: "a/AlphaTest.cls", tests: 1 }];
  const groups = [{ name: "First", classes: ["AlphaTest", "GoneTest"] }];
  const result = assignGroups(items, groups, "classes", "map.json");
  assert.strictEqual(result.problems.length, 1);
  assert.match(result.problems[0], /"GoneTest", which matches nothing/);
});

test("reads a Jest result into suite ids and counts", () => {
  const results = {
    testResults: [
      {
        name: "C:\\repo\\packages\\site\\main\\default\\lwc\\footer\\__tests__\\footer.test.js",
        assertionResults: [{}, {}, {}]
      },
      {
        name: "/repo/packages/site/main/default/lwc/dataSource/__tests__/dataSourceStatic.test.js",
        assertionResults: [{}]
      }
    ]
  };
  const suites = collectJest(results);
  assert.deepStrictEqual(
    suites.map((s) => [s.id, s.tests]),
    [
      ["dataSource/dataSourceStatic", 1],
      ["footer/footer", 3]
    ]
  );
  assert.strictEqual(
    suites[1].file,
    "packages/site/main/default/lwc/footer/__tests__/footer.test.js"
  );
});

test("a suite outside lwc tests is an error", () => {
  assert.throws(
    () =>
      collectJest({
        testResults: [{ name: "/repo/other/x.test.js", assertionResults: [] }]
      }),
    /outside lwc/
  );
});

test("the file text keeps the exports and ignores the date when compared", () => {
  const apex = [{ name: "A", tests: 2 }];
  const jest = [{ name: "J", tests: 3 }];
  const monday = renderFile("2026-11-09", apex, jest);
  const tuesday = renderFile("2026-11-10", apex, jest);
  assert.match(monday, /export const COUNTED_ON = "2026-11-09";/);
  assert.match(monday, /export const APEX_GROUPS = \[/);
  assert.match(monday, /export const JEST_GROUPS = \[/);
  assert.strictEqual(withoutDate(monday), withoutDate(tuesday));
  assert.strictEqual(
    withoutDate(monday),
    withoutDate(monday.replace(/\n/g, "\r\n"))
  );
});

test("a changed count or group name shows when compared", () => {
  const base = renderFile("2026-11-09", [{ name: "A", tests: 2 }], []);
  assert.notStrictEqual(
    withoutDate(base),
    withoutDate(renderFile("2026-11-09", [{ name: "A", tests: 3 }], []))
  );
  assert.notStrictEqual(
    withoutDate(base),
    withoutDate(renderFile("2026-11-09", [{ name: "B", tests: 2 }], []))
  );
});
