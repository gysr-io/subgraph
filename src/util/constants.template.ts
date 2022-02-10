// constants

import { BigDecimal, BigInt, Address } from '@graphprotocol/graph-ts';


export let ZERO_BIG_DECIMAL = BigDecimal.fromString('0');
export let ZERO_BIG_INT = BigInt.fromI32(0);
export let ONE_E_18 = (BigInt.fromI32(10).pow(18)).toBigDecimal();

export let WRAPPED_NATIVE_ADDRESS = '{{wrapped_native_address}}';
export let WETH_ADDRESS = '{{weth_address}}';

export let ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

export let GYSR_TOKEN = '{{gysr_address}}';

export let STABLECOINS: string[] = [
  '{{usdc_address}}',  // usdc
  '{{usdt_address}}',  // usdt
  '{{dai_address}}',   // dai
];
export let STABLECOIN_DECIMALS: number[] = [6, 6, 18];

export let PRICING_PERIOD = BigInt.fromI32(21600);  // 6 hours
export let PRICING_MIN_TVL = BigDecimal.fromString('1000.0');

// uniswap
export let USD_NATIVE_PAIR = '{{usd_native_address}}';
export let USD_WETH_PAIR = '{{usd_weth_address}}';
export let UNISWAP_FACTORY = '{{uniswap_factory}}';
export let SUSHI_FACTORY = '{{sushi_factory}}';
export let MIN_USD_PRICING = BigDecimal.fromString('2000.0');

// contract
export let INITIAL_SHARES_PER_TOKEN = BigDecimal.fromString('1000000');

// factories
export let ERC20_COMPETITIVE_REWARD_MODULE_FACTORY = Address.fromString('{{erc20_competitive_reward_module_factory_address}}');
export let ERC20_FRIENDLY_REWARD_MODULE_FACTORY = Address.fromString('{{erc20_friendly_reward_module_factory_address}}');
export let ERC20_STAKING_MODULE_FACTORY = Address.fromString('{{erc20_staking_module_factory_address}}');
export let ERC721_STAKING_MODULE_FACTORY = Address.fromString('{{erc721_staking_module_factory_address}}');
