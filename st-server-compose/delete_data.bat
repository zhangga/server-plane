@echo off

set DIR1=%~dp0mongo-data
set DIR2=%~dp0etcd-data
set DIR3=%~dp0redis-data
set DIR4=%~dp0external_storage

for %%D in ("%DIR1%" "%DIR2%" "%DIR3%" "%DIR4%") do (
    if exist "%%D" (
        echo Deleting %%D
        rmdir /s /q "%%D"
    )
)

pause