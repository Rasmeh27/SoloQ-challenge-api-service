#!/usr/bin/env bash
#
# Reproducible proof that the challenge state survives the container lifecycle.
#
#   1. builds the production image
#   2. starts a container with a named volume mounted on CHALLENGE_DATA_DIR
#   3. writes state (challenge initialization) through the API
#   4. stops and REMOVES the container
#   5. starts a brand new container on the same volume
#   6. asserts the state is still there
#   7. asserts the non root `node` user can write inside CHALLENGE_DATA_DIR
#
# Usage:  npm run docker:persistence-test
# Requires: Docker daemon running. Nothing else; no Riot API key is needed because the
# assertions only cover storage, not synchronization.

set -euo pipefail

IMAGE_NAME="soloq-challenge-backend:persistence-test"
VOLUME_NAME="soloq-challenge-persistence-test"
CONTAINER_ONE="soloq-persistence-1"
CONTAINER_TWO="soloq-persistence-2"
HOST_PORT="${HOST_PORT:-3097}"
ADMIN_KEY="docker-persistence-test-admin-key"
BASE_URL="http://localhost:${HOST_PORT}/api/v1"

cleanup() {
  docker rm -f "${CONTAINER_ONE}" "${CONTAINER_TWO}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "FAILED: $*" >&2
  exit 1
}

wait_for_health() {
  local attempt=0
  until curl -fsS "${BASE_URL}/health" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    [ "${attempt}" -gt 60 ] && fail "the container did not become healthy in time"
    sleep 1
  done
}

run_container() {
  docker run -d --name "$1" \
    -p "${HOST_PORT}:3001" \
    -e ADMIN_INTERNAL_API_KEY="${ADMIN_KEY}" \
    -e SYNC_ENABLED=false \
    -e CORS_ORIGINS='*' \
    -v "${VOLUME_NAME}:/app/data" \
    "${IMAGE_NAME}" >/dev/null
}

echo "==> 0/7 cleaning up any previous run"
cleanup
docker volume rm "${VOLUME_NAME}" >/dev/null 2>&1 || true

echo "==> 1/7 building the production image"
docker build -t "${IMAGE_NAME}" .

echo "==> 2/7 starting the first container with the volume mounted"
docker volume create "${VOLUME_NAME}" >/dev/null
run_container "${CONTAINER_ONE}"
wait_for_health

echo "==> 3/7 verifying the non root user can write the data directory"
docker exec "${CONTAINER_ONE}" sh -c 'id -un' | grep -qx 'node' \
  || fail "the container is not running as the non root user 'node'"
docker exec "${CONTAINER_ONE}" sh -c 'touch /app/data/.write-probe && rm /app/data/.write-probe' \
  || fail "the non root user cannot write in CHALLENGE_DATA_DIR"
curl -fsS "${BASE_URL}/health" | grep -q '"storageWritable":true' \
  || fail "the health endpoint reports the storage as not writable"

echo "==> 4/7 writing state (challenge initialization)"
# The roster ships an example Riot ID, so initialization legitimately fails per participant
# without a real API key. What matters here is that the write reaches the volume.
curl -fsS -X POST "${BASE_URL}/admin/challenge/initialize" \
  -H "x-internal-api-key: ${ADMIN_KEY}" \
  -H 'content-type: application/json' \
  -d '{"acknowledgeLateBaseline":true}' >/dev/null
docker exec "${CONTAINER_ONE}" sh -c 'cat /app/data/challenge-state.json' >/dev/null \
  || fail "challenge-state.json was not written to the volume"
STATE_BEFORE=$(docker exec "${CONTAINER_ONE}" sh -c 'cat /app/data/challenge-state.json')
echo "${STATE_BEFORE}" | grep -q '"challengeId"' || fail "the persisted state looks empty"

echo "==> 5/7 stopping and removing the container"
docker rm -f "${CONTAINER_ONE}" >/dev/null

echo "==> 6/7 starting a brand new container on the same volume"
run_container "${CONTAINER_TWO}"
wait_for_health

echo "==> 7/7 asserting the state survived"
STATE_AFTER=$(docker exec "${CONTAINER_TWO}" sh -c 'cat /app/data/challenge-state.json')
[ "${STATE_BEFORE}" = "${STATE_AFTER}" ] \
  || fail "the persisted state changed across containers"
curl -fsS "${BASE_URL}/challenge" | grep -q '"challenge"' \
  || fail "the new container cannot serve the challenge endpoint"

echo
echo "PASSED: the state survived the container being destroyed and recreated."
echo "Persisted document:"
echo "${STATE_AFTER}"
echo
echo "Clean up the volume with: docker volume rm ${VOLUME_NAME}"
