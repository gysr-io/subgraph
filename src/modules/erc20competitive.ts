// handler methods for the erc20 competitive reward module

import { Address, BigInt, Bytes, log, store } from '@graphprotocol/graph-ts';
import { ERC20BaseRewardModule as ERC20BaseRewardModuleContract } from '../../generated/templates/RewardModule/ERC20BaseRewardModule';
import {
  Staked1 as Staked,
  Unstaked1 as Unstaked,
  Claimed1 as Claimed
} from '../../generated/templates/StakingModule/Events';
import { RewardsFunded } from '../../generated/templates/RewardModule/Events';
import { ERC20CompetitiveRewardModuleV2 } from '../../generated/templates/StakingModule/ERC20CompetitiveRewardModuleV2';
import { ERC20CompetitiveRewardModuleV3 } from '../../generated/templates/StakingModule/ERC20CompetitiveRewardModuleV3';
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

export function handleRewardsFundedCompetitive(
  event: RewardsFunded,
  pool: Pool,
  tokens: Map<String, Token>
): void {
  let contract = ERC20BaseRewardModuleContract.bind(event.address);

  // update timeframe for pool
  if (event.params.timestamp.lt(pool.start) || pool.start.equals(ZERO_BIG_INT)) {
    pool.start = event.params.timestamp;
  }
  let tkn = event.params.token.toHexString();
  let addr = event.params.token;
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
  funding.token = tkn;
  funding.createdTimestamp = event.block.timestamp;
  funding.start = event.params.timestamp;
  funding.end = end;
  funding.originalAmount = integerToDecimal(event.params.amount, tokens[tkn].decimals);
  funding.shares = integerToDecimal(event.params.shares, tokens[tkn].decimals);
  funding.sharesPerSecond = ZERO_BIG_DECIMAL;
  if (duration.gt(ZERO_BIG_INT)) {
    funding.sharesPerSecond = funding.shares.div(duration.toBigDecimal());
  }
  funding.cleaned = false;
  funding.save(); // save before pricing

  pool.fundings = pool.fundings.concat([funding.id]);
}

export function handleStakedCompetitive(
  event: Staked,
  pool: Pool,
  position: Position,
  token: Token
): void {
  // create new stake
  let stakeId = position.id + '_' + event.transaction.hash.toHexString();

  let stake = new Stake(stakeId);
  stake.position = position.id;
  stake.pool = pool.id;
  stake.shares = integerToDecimal(event.params.shares, token.decimals);
  stake.timestamp = event.block.timestamp;

  position.stakes = position.stakes.concat([stake.id]);

  stake.save();
}

export function handleUnstakedCompetitiveV2(
  event: Unstaked,
  pool: Pool,
  position: Position,
  token: Token
): void {
  // competitive
  let rewardContract = ERC20CompetitiveRewardModuleV2.bind(Address.fromString(pool.rewardModule));
  let count = rewardContract.stakeCount(event.params.user).toI32();

  // get position data from contract
  let shares = ZERO_BIG_DECIMAL;
  let ts = ZERO_BIG_INT;
  if (count > 0) {
    // get info for updated last position
    let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
    shares = integerToDecimal(s.value0, token.decimals);
    ts = s.value1;
  }

  // update or delete current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  for (let i = stakes.length - 1; i >= 0; i--) {
    if (i >= count) {
      // delete any trailing stakes that we know have been removed
      store.remove('Stake', stakes[i]);
      stakes.pop();
      continue;
    }
    // update remaining trailing stake
    let stake = Stake.load(stakes[i])!;

    // verify position timestamps
    if (ts != stake.timestamp) {
      log.error('Stake timestamps not equal: {} != {}', [
        stake.timestamp.toString(),
        ts.toString()
      ]);
    }

    // set updated share amount
    stake.shares = shares;
    stake.save();
    break;
  }
  position.stakes = stakes;
}

export function handleUnstakedCompetitiveV3(
  event: Unstaked,
  pool: Pool,
  position: Position,
  token: Token
): void {
  // competitive
  let rewardContract = ERC20CompetitiveRewardModuleV3.bind(Address.fromString(pool.rewardModule));
  let account = event.params.account;
  let count = rewardContract.stakeCount(account).toI32();

  // get position data from contract
  let shares = ZERO_BIG_DECIMAL;
  let ts = ZERO_BIG_INT;
  if (count > 0) {
    // get info for updated last position
    let s = rewardContract.stakes(account, BigInt.fromI32(count - 1));
    shares = integerToDecimal(s.value0, token.decimals);
    ts = s.value1;
  }

  // update or delete current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  for (let i = stakes.length - 1; i >= 0; i--) {
    if (i >= count) {
      // delete any trailing stakes that we know have been removed
      store.remove('Stake', stakes[i]);
      stakes.pop();
      continue;
    }
    // update remaining trailing stake
    let stake = Stake.load(stakes[i])!;

    // verify position timestamps
    if (ts != stake.timestamp) {
      log.error('Stake timestamps not equal: {} != {}', [
        stake.timestamp.toString(),
        ts.toString()
      ]);
    }

    // set updated share amount
    stake.shares = shares;
    stake.save();
    break;
  }
  position.stakes = stakes;
}

export function handleClaimedCompetitiveV2(
  event: Claimed,
  pool: Pool,
  position: Position,
  token: Token
): void {
  // competitive
  let rewardContract = ERC20CompetitiveRewardModuleV2.bind(Address.fromString(pool.rewardModule));
  let count = rewardContract.stakeCount(event.params.user).toI32();

  // update current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  if (count == stakes.length && count > 0) {
    // update timestamp for last position
    let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
    let stake = Stake.load(stakes[count - 1])!;
    stake.timestamp = s.value1;
    stake.save();
  } else {
    // rebuild stakes list
    for (let i = 0; i < stakes.length; i++) {
      store.remove('Stake', stakes[i]);
    }
    stakes = [];
    for (let i = 0; i < count; i++) {
      let s = rewardContract.stakes(event.params.user, BigInt.fromI32(i));
      let stakeId = position.id + '_' + i.toString();

      let stake = new Stake(stakeId);
      stake.position = position.id;
      stake.pool = pool.id;
      stake.shares = integerToDecimal(s.value0, token.decimals);
      stake.timestamp = s.value1;

      stake.save();

      stakes = stakes.concat([stake.id]);
    }
  }

  position.stakes = stakes;
}

export function handleClaimedCompetitiveV3(
  event: Claimed,
  pool: Pool,
  position: Position,
  token: Token
): void {
  // competitive
  let rewardContract = ERC20CompetitiveRewardModuleV3.bind(Address.fromString(pool.rewardModule));
  let account = event.params.account;
  let count = rewardContract.stakeCount(account).toI32();

  // update current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  if (count == stakes.length && count > 0) {
    // update timestamp for last position
    let s = rewardContract.stakes(account, BigInt.fromI32(count - 1));
    let stake = Stake.load(stakes[count - 1])!;
    stake.timestamp = s.value1;
    stake.save();
  } else {
    // rebuild stakes list
    for (let i = 0; i < stakes.length; i++) {
      store.remove('Stake', stakes[i]);
    }
    stakes = [];
    for (let i = 0; i < count; i++) {
      let s = rewardContract.stakes(account, BigInt.fromI32(i));
      let stakeId = position.id + '_' + i.toString();

      let stake = new Stake(stakeId);
      stake.position = position.id;
      stake.pool = pool.id;
      stake.shares = integerToDecimal(s.value0, token.decimals);
      stake.timestamp = s.value1;

      stake.save();

      stakes = stakes.concat([stake.id]);
    }
  }

  position.stakes = stakes;
}

export function updatePoolCompetitive(
  pool: Pool,
  tokens: Map<String, Token>,
  rewardTokens: Map<String, PoolRewardToken>,
  timestamp: BigInt
): void {
  let tkn = rewardTokens.keys()[0];
  let rewardSharesPerToken = INITIAL_SHARES_PER_TOKEN;
  if (pool.rewards.gt(ZERO_BIG_DECIMAL)) {
    let contract = ERC20BaseRewardModuleContract.bind(Address.fromString(pool.rewardModule));
    rewardSharesPerToken = integerToDecimal(
      contract.lockedShares(Address.fromString(tkn)),
      tokens[tkn].decimals
    ).div(pool.rewards);
  }
  rewardTokens[tkn].sharesPerToken = rewardSharesPerToken;
  pool.rewardSharesPerToken = rewardSharesPerToken;
}
