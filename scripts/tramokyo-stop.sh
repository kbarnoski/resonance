#!/bin/bash
# Tramokyo kiosk shutdown — wrapped by ~/Desktop/Tramokyo Stop.app.
pkill -f "tramokyo-chrome" 2>/dev/null
lsof -ti :3000 | xargs kill 2>/dev/null
exit 0
