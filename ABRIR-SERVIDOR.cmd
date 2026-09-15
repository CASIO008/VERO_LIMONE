@echo off
chcp 65001 >nul
title DAVVERO LIMONE - servidor opcional (SQLite)
cd /d "%~dp0"
echo.
echo   DAVVERO LIMONE - servidor OPCIONAL
echo   ---------------------------------------------
echo   A loja NAO precisa deste servidor: sem ele, a
echo   conta, os cartoes e os pedidos ficam no proprio
echo   navegador (modo local).
echo.
echo   Use este atalho se quiser o banco SQLite de
echo   verdade (sql/schema.sql), com scrypt no lugar
echo   do PBKDF2 e os dados em server\data\vero.db.
echo.
echo   Deixe a janela aberta e acesse:
echo   http://localhost:4173
echo.
echo   Para parar: Ctrl+C ou feche a janela.
echo   ---------------------------------------------
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   [!] Node.js nao encontrado no PATH.
  echo       Instale a versao 22 ou superior em https://nodejs.org
  echo       ou simplesmente use ABRIR-LOJA.cmd, que nao precisa disso.
  echo.
  pause
  exit /b 1
)
node "server\server.js"
echo.
echo   Servidor encerrado.
pause
