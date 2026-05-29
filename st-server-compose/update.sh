#!/usr/bin/env bash
set -euo pipefail

chmod +x ttgops-cli_linux64

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TTGOPS="${SCRIPT_DIR}/ttgops-cli_linux64"
CFG="${SCRIPT_DIR}/.ttgops-cli.yaml"

# ===== 在这里直接配置镜像列表 =====
IMAGES=(
  "harbor-sh.dailygn.com/pst/tgateserver:master-latest"
  "harbor-sh.dailygn.com/pst/gameserver:master-latest"
  "harbor-sh.dailygn.com/pst/scenexserver:master-latest"
  "harbor-sh.dailygn.com/pst/globalserver:master-latest"
  "harbor-sh.dailygn.com/pst/matcherserver:master-latest"
)

echo "Using config: ${CFG}"
if [[ ! -f "${CFG}" ]]; then
  echo "Config file not found: ${CFG}"
  exit 1
fi

echo "=============================="
echo "Pull images via ttgops-cli"
echo "=============================="

for img in "${IMAGES[@]}"; do
  echo
  echo "Pulling ${img} ..."
  "${TTGOPS}" -c "${CFG}" icr pull "${img}"
done

echo
echo "All images pulled successfully."
read -r -p "Press Enter to exit..."
