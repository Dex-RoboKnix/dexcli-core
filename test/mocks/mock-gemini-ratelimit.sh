#!/bin/bash
# dexcli/test/mocks/mock-gemini-ratelimit.sh

echo -e "\033[32mgemini>\033[0m "

count=0
while read -r line; do
    count=$((count + 1))
    if [ $count -gt 5 ]; then
        echo "Rate limit exceeded. Please wait."
        sleep 10
        count=0
    fi
    echo "Mock response to: $line"
    echo -e "\033[32mgemini>\033[0m "
done
