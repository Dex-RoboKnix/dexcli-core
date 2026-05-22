#!/bin/bash
# dexcli/test/mocks/mock-gemini-error.sh

echo -e "\033[32mgemini>\033[0m "

while read -r line; do
    if [ $((RANDOM % 4)) -eq 0 ]; then
        echo "Error: something went wrong"
    else
        echo "Mock response to: $line"
    fi
    echo -e "\033[32mgemini>\033[0m "
done
