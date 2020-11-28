// GYSR factory event handling and mapping

import { Address, BigInt, log } from "@graphprotocol/graph-ts"
import { GeyserFactory, GeyserCreated } from "../../generated/GeyserFactory/GeyserFactory"
import { Geyser as GeyserContract } from "../../generated/GeyserFactory/Geyser"
import { ERC20 } from "../../generated/GeyserFactory/ERC20"
import { Geyser, Token } from "../../generated/schema"


export function handleGeyserCreated(event: GeyserCreated): void {

  // interface to actual Geyser contract
  let contract = GeyserContract.bind(event.params.geyser);

  // staking token
  let stakingToken = Token.load(contract.stakingToken().toHexString())

  if (stakingToken === null) {
    stakingToken = createNewToken(contract.stakingToken());
    stakingToken.save();
  }

  // reward token
  let rewardToken = Token.load(contract.rewardToken().toHexString())

  if (rewardToken === null) {
    rewardToken = createNewToken(contract.rewardToken());
    rewardToken.save();
  }

  // geyser entity
  let geyser = new Geyser(event.params.geyser.toHexString());
  geyser.stakingToken = stakingToken.id;
  geyser.rewardToken = rewardToken.id;
  geyser.bonusMin = contract.bonusMin();
  geyser.bonusMax = contract.bonusMax();
  geyser.bonusPeriod = contract.bonusPeriod();
  geyser.createdBlock = event.block.number;
  geyser.createdTimestamp = event.block.timestamp;

  geyser.save();
}


// helper function to define and populate new token entity
function createNewToken(address: Address): Token {
  let tokenContract = ERC20.bind(address);

  let token = new Token(tokenContract._address.toHexString())
  token.name = '';
  token.symbol = '';
  token.decimals = BigInt.fromI32(0);
  token.totalSupply = BigInt.fromI32(0);

  let resName = tokenContract.try_name();
  if (!resName.reverted) {
    token.name = resName.value;
  }
  let resSymbol = tokenContract.try_symbol();
  if (!resSymbol.reverted) {
    token.symbol = resSymbol.value;
  }
  let resDecimals = tokenContract.try_decimals();
  if (!resDecimals.reverted) {
    token.decimals = BigInt.fromI32(resDecimals as i32);
  }
  let resSupply = tokenContract.try_totalSupply();
  if (!resSupply.reverted) {
    token.totalSupply = BigInt.fromI32(resSupply as i32);
  }

  return token;
}