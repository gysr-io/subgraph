# gysr-subgraph

This repository implements a subgraph to index data and events
for pools, tokens, and users on the [GYSR](https://www.gysr.io/) platform.

It is deployed here:
https://thegraph.com/explorer/subgraph/gysr-io/gysr

Documentation can be found here:
https://docs.gysr.io/developers/subgraph


## Setup

### Dependencies

Both **Node.js** and **npm** are required for package management and deployment. See instructions
for installation [here](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm). This
codebase has been tested with `nvm: v0.37.x`, `Node.js: v18.x`, and `npm: v10.x`.

To install node packages and other dependencies:
```
npm install
```

### Protocol deployment

Deploy GYSR [core contracts](https://github.com/gysr-io/core) to a public EVM network or look up
existing [deployment information](https://docs.gysr.io/developers/addresses).

Define configuration variables as needed in `config/<network>.json`.


### Subgraph

Register or login at the [Graph studio dashboard](https://thegraph.com/studio/).

Create a new subgraph if needed and retrieve your access token.

Authenticate locally (one time)
```
npx graph auth --studio <ACCESS_TOKEN>
```


## Build

Generate `subgraph.yaml` from network config
```
npm run prepare:sepolia
```

Run subgraph code generation
```
npm run codegen
```

Build subgraph (without deploying)
```
npm run build
```


## Deploy


Build and deploy subgraph to the Graph studio
```
npm run deploy:sepolia
```

Publish the subgraph to the Graph network using the studio interface.



## Local testing

It is also possible to run a local blockchain and graph node for testing and development.

Run a local development blockchain using the [Ganache](https://www.trufflesuite.com/docs/ganache/overview) desktop app or CLI.
(warning: now deprecated)

Deploy the GYSR core protocol to your local blockchain instance.

Follow the [quickstart](https://thegraph.com/docs/quick-start#local-development) to setup a local graph node.


Register subgraph with local graph node (one time)
```
npm run create-local
```

Build and deploy subgraph to local graph node
```
npm run deploy:local
```

Launch the truffle console and start [interacting with the deployed core contracts](https://www.trufflesuite.com/docs/truffle/getting-started/interacting-with-your-contracts)
to generate some events and activity.
```
npx truffle console
```

Monitor indexing logs of the graph node for debugging.

Examine and validate indexed data with the query sandbox at:
http://localhost:8000/subgraphs/name/gysr-io/gysr
