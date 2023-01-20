// handler methods for the erc20 competitive reward module

import { Address, BigInt, log } from '@graphprotocol/graph-ts'
import {
  ERC20BaseRewardModule as ERC20BaseRewardModuleContract,
  RewardsFunded
} from '../../generated/templates/RewardModule/ERC20BaseRewardModule'
import { Pool, Token, Funding, } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, INITIAL_SHARES_PER_TOKEN } from '../util/constants'


export function handleRewardsFundedCompetitive(event: RewardsFunded, pool: Pool, token: Token): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);

  // update timeframe for pool
  if (event.params.timestamp.lt(pool.start) || pool.start.equals(ZERO_BIG_INT)) {
    pool.start = event.params.timestamp;
  }
  let addr = Address.fromString(token.id);
  let idx = contract.fundingCount(addr).minus(BigInt.fromI32(1));
  let fundingStruct = contract.fundings(addr, idx);
  let duration = fundingStruct.value5;

  let end = event.params.timestamp.plus(duration);
  if (end.gt(pool.end) || pool.end.equals(ZERO_BIG_INT)) {
    pool.end = end;
  }

  // create funding
  let fundingId = pool.id + '_' + event.block.timestamp.toString();
  let funding = new Funding(fundingId);
  funding.pool = pool.id;
  funding.token = token.id;
  funding.createdTimestamp = event.block.timestamp;
  funding.start = event.params.timestamp;
  funding.end = end;
  funding.originalAmount = integerToDecimal(event.params.amount, token.decimals);
  funding.shares = integerToDecimal(event.params.shares, token.decimals);
  funding.sharesPerSecond = ZERO_BIG_DECIMAL;
  if (duration.gt(ZERO_BIG_INT)) {
    funding.sharesPerSecond = funding.shares.div(duration.toBigDecimal());
  }
  funding.cleaned = false;
  funding.save(); // save before pricing

  pool.fundings = pool.fundings.concat([funding.id])
}

export function updatePoolCompetitive(pool: Pool, token: Token, timestamp: BigInt): void {
  let rewardSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  if (pool.rewards.gt(ZERO_BIG_DECIMAL)) {
    let contract = ERC20BaseRewardModuleContract.bind(Address.fromString(pool.rewardModule));
    rewardSharesPerToken = integerToDecimal(
      contract.lockedShares(Address.fromString(token.id)),
      token.decimals
    ).div(pool.rewards);
  }
  pool.rewardSharesPerToken = rewardSharesPerToken;
}