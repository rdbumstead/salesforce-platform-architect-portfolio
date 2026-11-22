#!/bin/sh
# Runs one governance drill inside the GlassOps image (drill.yml). One container holds
# every step, so the scratch login env create writes to the container's temp folder is still
# there for plan, validate, gate and env delete. gate runs with --no-connect, so it records the
# configured tier and runs every rule, where a gate that logged in to a scratch org would treat
# it as ephemeral and allow it with no rule. The scratch org is deleted on every exit, through
# the trap, so a failed step never leaves one behind. Writes the exit code of each step to
# .glassops/drill-exit.txt for the workflow to judge.

set -u
CONFIG="${DRILL_CONFIG:?DRILL_CONFIG is not set}"
mkdir -p .glassops

CREATE_EXIT=none
PLAN_EXIT=none
VALIDATE_EXIT=none
GATE_EXIT=none
DELETE_EXIT=none

finish() {
  glassops report --config "$CONFIG" --summary .glassops/summary.md > /dev/null 2>&1
  glassops env delete --target drill --config "$CONFIG"
  DELETE_EXIT=$?
  {
    echo "CREATE_EXIT=$CREATE_EXIT"
    echo "PLAN_EXIT=$PLAN_EXIT"
    echo "VALIDATE_EXIT=$VALIDATE_EXIT"
    echo "GATE_EXIT=$GATE_EXIT"
    echo "DELETE_EXIT=$DELETE_EXIT"
  } > .glassops/drill-exit.txt
}
trap finish EXIT

glassops env create --target drill --config "$CONFIG"
CREATE_EXIT=$?
[ "$CREATE_EXIT" = "0" ] || exit 0

glassops plan --target drill --config "$CONFIG"
PLAN_EXIT=$?
[ "$PLAN_EXIT" = "0" ] || exit 0

# A validate that ran and failed (exit 1) is what the failing test drill needs, so gate runs
# after it whatever it returned.
glassops validate --target drill --config "$CONFIG"
VALIDATE_EXIT=$?
glassops gate --target drill --config "$CONFIG" --no-connect
GATE_EXIT=$?
exit 0
