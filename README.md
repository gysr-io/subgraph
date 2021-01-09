# gysr-subgraph

This repository implements a subgraph to index data and events
for Geysers, tokens, and users on the [GYSR](https://www.gysr.io/) platform.

It is deployed here:  
https://thegraph.com/explorer/subgraph/gysr-io/gysr


## Setup

### Dependencies

Both **Node.js** and **npm** are required for package management and deployment. See instructions
for installation [here](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). This
codebase has been tested with `nvm: v0.37.x`, `Node.js: v10.x`, and `npm: v6.x`.

To install node packages and other dependencies:
```
npm install
```

### Local development

Run a local development blockchain using the [Ganache](https://www.trufflesuite.com/docs/ganache/overview) desktop app or CLI.

Deploy GYSR [core contracts](https://github.com/gysr-io/core) to that Ganache local blockchain.
Make sure to specify the flag `--network development` while following the deployment instructions.

Follow the [quickstart](https://thegraph.com/docs/quick-start#local-development) to setup a local graph node.

Modify `subgraph.yaml` to point to the locally deployed factory contract `address` and comment out the `startBlock` parameter. Those current values are only relevant on mainnet.


## Deploy

Run subgraph code generation
```
npm run codegen
```

### Local

Register subgraph with local graph node (one time)
```
npm run create-local
```

Build and deploy subgraph to local graph node
```
npm run deploy-local
```

### Mainnet

Register or login at the [Graph explorer dashboard](https://thegraph.com/explorer/dashboard) and retrieve your access token.

Create a new subgraph if needed.

Authenticate locally (one time)
```
npx graph auth https://api.thegraph.com/deploy/ <ACCESS_TOKEN>
```

Make sure to reset `subgraph.yaml` to the original values for mainnet factory address and start block.

Build and deploy subgraph to hosted service
```
npm run deploy
```

## Test

### Local

Launch the truffle console and start [interacting with the deployed core contracts](https://www.trufflesuite.com/docs/truffle/getting-started/interacting-with-your-contracts)
to generate some events and activity.
```
npx truffle console
```

Monitor indexing logs of the graph node for debugging.

Examine and validate indexed data with the query sandbox at:  
http://localhost:8000/subgraphs/name/gysr-io/gysr
