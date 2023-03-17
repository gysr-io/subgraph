// constants

import { BigDecimal, BigInt, Address } from '@graphprotocol/graph-ts';


export let ZERO_BIG_DECIMAL = BigDecimal.fromString('0');
export let ZERO_BIG_INT = BigInt.fromI32(0);
export let ONE_E_18 = (BigInt.fromI32(10).pow(18)).toBigDecimal();

export let WRAPPED_NATIVE_ADDRESS = Address.fromString('{{wrapped_native_address}}');
export let WETH_ADDRESS = Address.fromString('{{weth_address}}');

export let ZERO_ADDRESS = Address.fromString('0x0000000000000000000000000000000000000000');

export let GYSR_TOKEN = Address.fromString('{{gysr_address}}');
export let GYSR_FEE = BigDecimal.fromString('0.20');

export let STABLECOINS: Address[] = [
  Address.fromString('{{usdc_address}}'),
  Address.fromString('{{usdt_address}}'),
  Address.fromString('{{dai_address}}'),
  Address.fromString('{{frax_address}}')
];
export let STABLECOIN_DECIMALS: number[] = [6, 6, 18, 18];

export let PRICING_PERIOD = BigInt.fromI32(21600);  // 6 hours
export let PRICING_MIN_TVL = BigDecimal.fromString('1000.0');

// uniswap
export let USD_NATIVE_PAIR = Address.fromString('{{usd_native_address}}');
export let USD_NATIVE_PAIR_V3 = Address.fromString('{{usd_native_address_v3}}');
export let USD_WETH_PAIR = Address.fromString('{{usd_weth_address}}');
export let USD_WETH_PAIR_V3 = Address.fromString('{{usd_weth_address_v3}}');
export let GYSR_NATIVE_PAIR = Address.fromString('{{gysr_native_address}}');
export let GYSR_NATIVE_START_TIME = BigInt.fromI64(parseInt('{{gysr_native_start_time}}') as i64);
export let GYSR_NATIVE_PAIR_V3 = Address.fromString('{{gysr_native_address_v3}}');
export let GYSR_NATIVE_V3_START_TIME = BigInt.fromI64(parseInt('{{gysr_native_v3_start_time}}') as i64);
export let UNISWAP_FACTORY = Address.fromString('{{uniswap_factory}}');
export let SUSHI_FACTORY = Address.fromString('{{sushi_factory}}');
export let UNISWAP_FACTORY_V3 = Address.fromString('{{uniswap_factory_v3}}');
export let UNISWAP_FACTORY_V3_START_TIME = BigInt.fromI64(parseInt('{{uniswap_factory_v3_start_time}}') as i64);
export let MIN_USD_PRICING = BigDecimal.fromString('2000.0');

// contract
export let INITIAL_SHARES_PER_TOKEN = BigDecimal.fromString('1000000');

// factories
export let ASSIGNMENT_STAKING_MODULE_FACTORIES: Address[] = [
  Address.fromString('{{assignment_staking_module_factory_address}}'),
  Address.fromString('{{assignment_staking_module_factory_address_v3beta}}'),
]
export let ERC20_COMPETITIVE_REWARD_MODULE_FACTORIES_V2: Address[] = [
  Address.fromString('{{erc20_competitive_reward_module_factory_address}}'),
  Address.fromString('{{erc20_competitive_reward_module_factory_address_v211}}')
];
export let ERC20_COMPETITIVE_REWARD_MODULE_FACTORIES_V3: Address[] = [
  Address.fromString('{{erc20_competitive_reward_module_factory_address_v3}}'),
  Address.fromString('{{erc20_competitive_reward_module_factory_address_v3beta}}')
];
export let ERC20_FRIENDLY_REWARD_MODULE_FACTORIES_V2: Address[] = [
  Address.fromString('{{erc20_friendly_reward_module_factory_address}}'),
  Address.fromString('{{erc20_friendly_reward_module_factory_address_v211}}')
];
export let ERC20_FRIENDLY_REWARD_MODULE_FACTORIES_V3: Address[] = [
  Address.fromString('{{erc20_friendly_reward_module_factory_address_v3}}'),
  Address.fromString('{{erc20_friendly_reward_module_factory_address_v3beta}}')
];
export let ERC20_LINEAR_REWARD_MODULE_FACTORIES: Address[] = [
  Address.fromString('{{erc20_linear_reward_module_factory_address}}'),
  Address.fromString('{{erc20_linear_reward_module_factory_address_v3beta}}'),
];
export let ERC20_MULTI_REWARD_MODULE_FACTORIES: Address[] = [
  Address.fromString('{{erc20_multi_reward_module_factory_address}}'),
  Address.fromString('{{erc20_multi_reward_module_factory_address_v3beta}}'),
];
export let ERC20_STAKING_MODULE_FACTORIES: Address[] = [
  Address.fromString('{{erc20_staking_module_factory_address}}'),
  Address.fromString('{{erc20_staking_module_factory_address_v3beta}}')
];
export let ERC721_STAKING_MODULE_FACTORIES: Address[] = [
  Address.fromString('{{erc721_staking_module_factory_address}}'),
  Address.fromString('{{erc721_staking_module_factory_address_v3beta}}')
];

// types
export let BASE_REWARD_MODULE_TYPES: string[] = ['ERC20CompetitiveV2', 'ERC20CompetitiveV3', 'ERC20FriendlyV2', 'ERC20FriendlyV3']
