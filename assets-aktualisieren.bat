@echo off
rem Nach dem Hinzufuegen/Umbenennen von Bildern oder Toenen einmal ausfuehren.
chcp 65001 >nul
node "%~dp0tools\assets.js"
echo.
pause
