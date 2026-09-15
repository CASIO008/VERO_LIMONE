@echo off
chcp 65001 >nul
title DAVVERO LIMONE - abrir a loja
cd /d "%~dp0"
echo.
echo   DAVVERO LIMONE
echo   ---------------------------------------------
echo   Abrindo a loja no seu navegador padrao.
echo.
echo   Tudo funciona sem servidor: sacola, conta,
echo   cartoes em slots, checkout e pedidos ficam
echo   guardados no proprio navegador.
echo.
echo   Nada de numero de cartao ou CVV e gravado.
echo   ---------------------------------------------
echo.
start "" "%~dp0index.html"
timeout /t 3 >nul
