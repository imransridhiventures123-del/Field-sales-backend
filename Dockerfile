# FILE: Dockerfile  (project root)
# NEW FILE — builds the backend as an AWS Lambda *container image*.
# Uses AWS's official Lambda Node.js base image, so the same image runs on
# Lambda in the cloud and on your PC (see docs/LAMBDA_DEPLOYMENT.md).

# ---- Stage 1: install production dependencies only ----
FROM public.ecr.aws/lambda/nodejs:22 AS deps
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Stage 2: final small image ----
FROM public.ecr.aws/lambda/nodejs:22
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=deps /build/node_modules ./node_modules
COPY package.json ./
COPY src ./src

# Lambda handler = file src/lambda.js, export "handler"
CMD ["src/lambda.handler"]
