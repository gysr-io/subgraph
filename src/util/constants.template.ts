// constants

import { BigDecimal, BigInt, Address } from '@graphprotocol/graph-ts';


export let ZERO_BIG_DECIMAL = BigDecimal.fromString('0');
export let ZERO_BIG_INT = BigInt.fromI32(0);

export let WETH_ADDRESS = '{{weth_address}}';

export let ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export let GYSR_TOKEN = '{{gysr_address}}';

export let STABLECOINS: string[] = [
  '{{usdc_address}}',  // usdc
  '{{usdt_address}}',  // usdt
  '{{dai_address}}',   // dai
];
export let STABLECOIN_DECIMALS: number[] = [6, 6, 18];

export let HIGH_VOLUME_TOKENS: string[] = [
  WETH_ADDRESS,        // weth
  '{{wbtc_address}}',  // wbtc
  '{{uni_address}}',   // uni
  '{{link_address}}',  // link
  '{{bnb_address}}',   // bnb
  '{{snx_address}}',   // snx
  '{{yfi_address}}',   // yfi
  '{{comp_address}}',  // comp
  '{{mkr_address}}',   // mkr
  '{{grt_address}}',   // grt
];

// uniswap
export let USDT_WETH_PAIR = '{{usdt_weth_address}}';
export let UNISWAP_FACTORY = '{{uniswap_factory}}';
export let SUSHI_FACTORY = '{{sushi_factory}}';
export let MIN_ETH_PRICING = BigDecimal.fromString('5.0');
export let MIN_USD_PRICING = BigDecimal.fromString('10000.0');

// contract
export let INITIAL_SHARES_PER_TOKEN = BigDecimal.fromString('1000000');

// factories
export let ERC20_COMPETITIVE_REWARD_MODULE_FACTORY = Address.fromString('{{erc20_competitive_reward_module_factory_address}}');
export let ERC20_FRIENDLY_REWARD_MODULE_FACTORY = Address.fromString('{{erc20_friendly_reward_module_factory_address}}');
