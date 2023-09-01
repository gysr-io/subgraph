// handler methods for the erc20 multi reward module

import { Address, BigInt, Bytes, log, store } from '@graphprotocol/graph-ts';
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/templates/RewardModule/ERC20BaseRewardModule';
import { ERC20MultiRewardModule as ERC20MultiRewardModuleContract } from '../../generated/templates/RewardModule/ERC20MultiRewardModule';
import {
  Staked1 as Staked,
  Unstaked1 as Unstaked,
  Claimed1 as Claimed
} from '../../generated/templates/StakingModule/Events';
import { RewardsFunded } from '../../generated/templates/RewardModule/Events';
import {
  Pool,
  Token,
  Funding,
  Position,
  User,
  Stake,
  PoolRewardToken
} from '../../generated/schema';
import { integerToDecimal } from '../util/common';
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, INITIAL_SHARES_PER_TOKEN } from '../util/constants';

export function updatePoolMulti(
  pool: Pool,
  tokens: Map<String, Token>,
  rewardTokens: Map<String, PoolRewardToken>,
  timestamp: BigInt
): void {
  let contract = ERC20BaseRewardModuleContract.bind(Address.fromString(pool.rewardModule));

  for (let i = 0; i < rewardTokens.keys().length; i++) {
    let tkn = rewardTokens.keys()[i];

    let rewardSharesPerToken = INITIAL_SHARES_PER_TOKEN;
    if (rewardTokens[tkn].amount.gt(ZERO_BIG_DECIMAL)) {
      rewardSharesPerToken = integerToDecimal(
        contract.lockedShares(Address.fromString(tkn)),
        tokens[tkn].decimals
      ).div(rewardTokens[tkn].amount);
    }

    rewardTokens[tkn].sharesPerToken = rewardSharesPerToken;
    if (i == 0) pool.rewardSharesPerToken = rewardSharesPerToken;
  }
}
