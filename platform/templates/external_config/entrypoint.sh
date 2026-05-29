#!/bin/bash

set -ex

params=${@}
service="${SERVICE:-gs}"

if [ "$service" == "gs" ]; then
 serviceName="game"
else
 serviceName="$service"
fi

echo "exec params $params"
sid=$(echo "${params}" | awk -F '-Dmodule.name=!$#service#$!_' '{print $2}' | awk -F ' ' '{print $1}')
echo "sid ${sid}"

if [ ! -d "/external_storage/" ]; then
	echo "pvc not mount"
	exit 1
fi

if [ ! -d "/external_config/" ]; then
	echo "configmap not mount"
	exit 1
fi

work_dir=${serviceName}_server

# 创建文件夹
log_path=/external_storage/${sid}/${POD_NAME}/logs
mkdir -p "$log_path"

link_path="/${work_dir}/logs"
if [ -L "$link_path" ] || [ -e "$link_path" ]; then
  rm -rf "$link_path"
fi
#ln -s "$log_path" /$work_dir/
ln -s "$log_path" "$link_path"

# 复制需要的文件
if [ -f "/external_config/${serviceName}/config.yaml" ]; then
	cp -f /external_config/${serviceName}/config.yaml /$work_dir
else
	echo "config.yaml not exist"
	exit 1
fi

if [ -f "/external_config/${serviceName}/log4j2.xml" ]; then
	cp -f /external_config/${serviceName}/log4j2.xml /$work_dir
else
	echo "log4j2.xml not exist"
	exit 1
fi

hot_path=/external_storage/${sid}/$work_dir
mkdir -p "$hot_path"

# 是否先清理旧热更数据
if [ -f "$hot_path/clean_tag" ]; then
	rm -rf "$hot_path"/config
	rm -rf "$hot_path"/patches
	rm -rf "$hot_path"/antidirt
	rm -rf "$hot_path"/clean_tag
else
  # efs有持久化热更数据，复制出来
  if [ -d "$hot_path/config" ]; then
	cp -rf "$hot_path"/config/* /$work_dir/config
  fi
  if [ -d "$hot_path/patches" ]; then
	cp -r "$hot_path"/patches/* /$work_dir/patches
  fi
  if [ -d "$hot_path/antidirt" ]; then
	cp -rf "$hot_path"/antidirt/* /$work_dir/antidirt
  fi
fi

cd /$work_dir

exec java $@
