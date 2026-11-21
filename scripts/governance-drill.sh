#!/bin/sh
# Runs one governance drill inside the GlassOps image (drill.yml, R29-5). One container holds
# every step, so the scratch login env create writes to the container's temp folder is still
# there for plan, validate, gate and env delete. gate runs with --no-connect, so it records the
# configured tier and runs every rule, where a gate that logged in to a scratch org would treat
# it as ephemeral and allow it with no rule. The scratch org is deleted whatever happens.
# Writes the exit code of each step to .glassops/drill-exit.txt for the workflow to judge.

set -u
CONFIG="${DRILL_CONFIG:?DRILL_CONFIG is not set}"
mkdir -p .glassops

glassops env create --target drill --config "$CONFIG"
CREATE_EXIT=$?
PLAN_EXIT=none
VALIDATE_EXIT=none
GATE_EXIT=none
if [ "$CREATE_EXIT" = "0" ]; then
  glassops plan --target drill --config "$CONFIG"
  PLAN_EXIT=$?
  if [ "$PLAN_EXIT" = "0" ]; then
    # A validate that ran and failed (exit 1) is what drill 1 needs, so gate runs after it.
    glassops validate --target drill --config "$CONFIG"
    VALIDATE_EXIT=$?
    glassops gate --target drill --config "$CONFIG" --no-connect
    GATE_EXIT=$?
  fi
fi
glassops report --config "$CONFIG" --summary .glassops/summary.md > /dev/null
glassops env delete --target drill --config "$CONFIG"
DELETE_EXIT=$?

{
  echo "CREATE_EXIT=$CREATE_EXIT"
  echo "PLAN_EXIT=$PLAN_EXIT"
  echo "VALIDATE_EXIT=$VALIDATE_EXIT"
  echo "GATE_EXIT=$GATE_EXIT"
  echo "DELETE_EXIT=$DELETE_EXIT"
} > .glassops/drill-exit.txt
exit 0
