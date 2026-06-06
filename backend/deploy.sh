#!/bin/bash
# Run from the backend/ directory to package and upload to Lambda
# Usage: bash deploy.sh <function-name> <region>
# Example: bash deploy.sh stmichael-cms-api ap-south-1

set -e

FUNCTION_NAME=${1:-stmichael-cms-api}
REGION=${2:-ap-south-1}

echo "Installing dependencies..."
npm install --omit=dev

echo "Zipping..."
zip -r ../lambda.zip . -x "*.sh" -x "*.sql" -x "*.md"

echo "Uploading to Lambda ($FUNCTION_NAME in $REGION)..."
aws lambda update-function-code \
  --function-name "$FUNCTION_NAME" \
  --zip-file fileb://../lambda.zip \
  --region "$REGION"

rm ../lambda.zip
echo "Done."
