################################
# gateway builder
ARG IMAGE_NAME=riscv64/alpine
ARG IMAGE_TAG=3.22.1

FROM --platform=linux/riscv64 ${IMAGE_NAME}:${IMAGE_TAG} AS builder

# Install build essential
RUN apk add alpine-sdk clang clang-dev

# Install guest tools and libcmt
ARG MACHINE_GUEST_TOOLS_VERSION=0.17.1-r1
ADD --chmod=644 https://edubart.github.io/linux-packages/apk/keys/cartesi-apk-key.rsa.pub /etc/apk/keys/cartesi-apk-key.rsa.pub
RUN echo "https://edubart.github.io/linux-packages/apk/stable" >> /etc/apk/repositories
RUN apk update && \
    apk add cartesi-machine-guest-tools=${MACHINE_GUEST_TOOLS_VERSION} && \
    apk add cartesi-machine-guest-libcmt-dev=${MACHINE_GUEST_TOOLS_VERSION}


FROM builder AS build

# Compile
WORKDIR /home/app
# COPY src/config config
COPY src/ .
RUN make clean && make


################################
# rootfs app
FROM --platform=linux/riscv64 scratch

COPY --from=build /home/app/dist/* /
