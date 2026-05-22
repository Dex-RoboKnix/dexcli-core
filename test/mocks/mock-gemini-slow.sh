#!/bin/bash
# dexcli/test/mocks/mock-gemini-slow.sh

echo -e "\033[32mgemini>\033[0m "

while read -r line; do
    sleep 2
    echo "Mock response to: $line"
    echo '```javascript'
    echo '// file: mock-output.js'
    echo 'console.log("mock artifact");'
    echo '```'
    echo -e "\033[32mgemini>\033[0m "
done
