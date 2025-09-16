# Rives Barebones with Doom

```
Cartesi Rollups Node version: 2.0.x
```

The RiscV Entertainment System (RIVES) barebones with Doom is a proof of concept that allows users to play the [riscv-binary port of Freedoom](https://github.com/rives-io/cartridge-freedoom) on a RISC-v Cartesi Machine on the browser, submit the game moves onchain so the session will be replayed in a Cartesi Rollups App to generate a provable score.

DISCLAIMERS

For now, this is not a final product and should not be used as one.

## Requirements

- [cartesapp](https://github.com/prototyp3-dev/cartesapp) to build, test, and execute the Cartesi Rollups node.
- [docker](https://docs.docker.com/) to execute the cartesapp sdk image that runs the cartesi rollups node and other tools.

## Instructions

Install Cartesapp:

```shell
python3 -m venv .venv
. .venv/bin/activate
pip3 install cartesapp[dev]@git+https://github.com/prototyp3-dev/cartesapp@main
pip3 install pytest-randomly
```

### Run Devnet

You can run a cartesi rollups node on a local devnet with:

```shell
cartesapp node
```

This will generate the snapshot if it doesn't exist, and start the node.

### Running in Dev Mode

You'll be able to update the binaries and the snapshot will be updated. To generate the binaries run:

```shell
make -f src/Makefile build
```

Then run make the node in dev mode:

```shell
cartesapp node --log-level debug --dev --dev-watch-patterns='*' --dev-path='./src/dist' --drive-config app.builder=directory --drive-config app.directory=./src/dist --machine-config "entrypoint=/etc/cartesi-init.d/contracts-init && /mnt/app/gateway"
```

Any time you regenerate the binaries, it will rebuild its flash drive, replace it on the current snapshot of the machine, and force a reload on the app.

## Interacting with Rives Barebones with Doom

### Rivemu

To send Doom gameplay logs to the backend you should first run generate a gameplay log by playing the Freedoom cartridge with the [Rivemu](https://github.com/rives-io/riv/releases/tag/v0.3-rc16). You should download the appropriate binary (adjust the platform and architecture variables):

```shell
PLATFORM=linux
ARCH=amd64
wget https://github.com/rives-io/riv/releases/download/v0.3-rc16/rivemu-${PLATFORM}-${ARCH} -O rivemu
chmod +x rivemu
```

Then you can play Freedoom with:

```shell
./rivemu cartridges/freedoom.sqfs
```

### Submit the Gameplay

To submit the gameplay, you'll need to record the gameplay while playing the game. Additionally, to add security the backend requires the hash of the final outcard, and the entropy of the game will be tied to wallet that will submit the gameplay. With this in mind, you run the following command to generate a valid gameplay for submission (change the wallet address variable accordingly):

```shell
WALLET_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
./rivemu -save-outhash=gameplay.outhash -record=gameplay.rivlog -entropy=${WALLET_ADDRESS} cartridges/freedoom.sqfs
```

This will generate a file called `gameplay.rivlog` with the gameplay logs and a file called `gameplay.outhash` with hash of the gameplay outcard.

Then you can submit the gameplay with the command next. We'll assume you are using the local devnet initiated on one of the previous steps (set the application address and blockchain configuration with the correct values):

```shell
INPUTBOX_ADDRESS=0xc70074BDD26d8cF983Ca6A5b89b8db52D5850051
APPLICATION_ADDRESS=0xE34467a44bD506b0bCc4474eb19617b156D93c29
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
cast send --private-key ${PRIVATE_KEY} ${INPUTBOX_ADDRESS} "addInput(address,bytes)" ${APPLICATION_ADDRESS} 0x$(cat gameplay.outhash)$(xxd -p -c10000 gameplay.rivlog)
```

### Run the Tests

To run the tests:

```shell
cartesapp test --cartesi-machine --log-level debug
```

## Cartesi Machine Shell

You can run the cartesi shell with:

```shell
cartesapp shell --log-level debug --drive-config app.builder=volume --drive-config app.directory=./src/dist
```
