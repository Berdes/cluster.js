#!/bin/bash
cd $1
node worker.js $2 $3 </dev/null >/dev/null 2>/dev/null &
