const fs = require("fs");
const COMPANY_DATA = 'dataset.csv';

//===============================================MODEL CONSTANTS=========================
	//some are let, rather than const, so that in future we can manipulate / do sensitivity testing in the model
const LIQUID_BANKS_ONLY = true;
const IN_STATE_SCREEN_ONLY = false; //will limit the model to only looking at partners headquartered in the same state
const DEFAULT_MODE = true;  //triggers various simplifying calculations for the beta version
let DEFAULT_TBV_MARKUP = .25; //drives how much each bank is valued
let MIXED_CONSIDERATION_CASH = .5; //if a deal has mixed consideration, model defaults to this percentage of total consideration in cash
const MIN_ASSET_SIZE = 0; //smallest allowable bank to include in model, total assets in $1000s
const MAX_ASSET_SIZE = 10000000000000; //largest '' $1000s
let ALL_MARK_PERCENTAGE = .1; //default markup on the ALL for estimating purchase price allocations
let OREO_MARK = .1; //defaul credit mark on OREO for estimating purchase price allocations
let CDI_RATE = .015; //for calculating core deposit intangibles
const MARGINAL_TAX_RATE = .35; //standard rate used for all model calculations
const TRANSACTION_COST_RATE = .05 * (1-MARGINAL_TAX_RATE); //estimated tranasction costs, as a percentage of equity - CHECK - DO WE TAX EFFECT THIS?
const TRAN_COST_REALIZED_AT_CLOSE = .5; //for cash debits for PPA
const TRAN_COST_REALIZED_AFTER_CLOSE = 1-TRAN_COST_REALIZED_AT_CLOSE; //this will flow to the following year
const CASH_OPP_COST_RATE = .02; //opportunity cost of cash used to fund merger / acquisition
const MOE_ENABLED = false; //for the future, this would drive if we try to do an MOE check for the merger pairing
let EPS_GROWTH_RATE = .05;// to estimate next year's net income for the merger screen...for EPS accretion
let NIE_SYNERGY_RATE = .35; //estimated cost savings, fully ramped, to include in accretion estimates
const EPS_ACCRETION_HURDLE = .05; //minimum earnings accretion to allow the deal to be proposed
const TBV_PAYBACK_CEILING = 5; //max time, in years, allowed for tangible book value per share payback in order for the deal to be proposed

//===============================================RUN THE MODEL===========================

let getData = () => {

	//enable async reading of the raw data import file
	return new Promise((resolve, reject) => {
		fs.readFile(COMPANY_DATA, 'utf-8',(err, data) => {

	if (err) reject(err)

	//get rid of uneeded quote marks
	data.replace(/["']/g, "");

	//turn CSV string into an array
	let arr = data.split("\r\n");

	//break dowwn array into individual bank data components
	let outputArr = arr.map((cur, ind) => {

		let bank = cur.split(',');
		return bank

	});

	//send the array of bank data to the next step, create bank objects
	resolve(outputArr);

})

});
}

//get the raw bank data
var dataArray = getData();

//once we have the data, move into the main function
dataArray.then((data) => {
 	
	let bankObjectArray = data.map((cur, ind) => {

		let bankObj = new BankConstructor(cur);
		return bankObj;

	})

	//run the screen on every bank
	mergerScreen(bankObjectArray);

	//print out merger options

})



//===============================================FUNCTIONS===========================
//function that controls 'flow' of the merger screening model
function mergerScreen(arr){

	var modelData = arr;

	//filter out the OTC banks, only if configuration set = true
	if (LIQUID_BANKS_ONLY === true) {
		modelData = filterBanks(arr);
	}

	//run valuation logics on all banks remaining in the sample set
	valueBanks(modelData);

	//run merger logic on each bank in the list
	modelData.forEach((cur, ind) => {
		//each bank will ultimately be tested against all other banks in the array to see if a merger could work

		//FUTURE ITEM - CALL ACQUIRIER ABILITY TO ACQUIRE FUNCTION - PULL OUT THOSE THAT ARE DISTRESSED / CAN'T ACQUIRE FOR VARIOUS REASONS
		if (ableToAcquire(cur) === true) {		
		//screening tool receives the current bank object, the index of the current bank object, and the full array of eligible banks for testing
		mergerModel(cur['name'], ind, cur, modelData);
		}
		else {
			//do nothing - don't run the model
		}

	});


}


//to filter out banks that we don't want in this set, for various reasons - current is based on exchange on which bank traded
function filterBanks(arr){

	let filteredBankList = [];

	//filter out all the non-OTC banks.....return to this one and refactor to make more flexible based on in/out of scope exchanges
	arr.forEach((cur, ind) => {

		if (cur['exchange'] === 'NYSE' || cur['exchange'] === 'NASDAQ') {

			filteredBankList.push(arr[ind]);

		}

	})

	return filteredBankList

}

//run a very detailed comps algorithim to value the bank - logic TBD
function valueOnComps(arr){
	return true
}


//apply a valuation to all banks - default is to calculate a standard markup of tangible book value
function valueBanks(arr){

	if (DEFAULT_MODE) {

		//loop through the bank array passed into function and update the valuations
		arr.forEach((cur, ind) => {

			//default valuation when bank object imported is $1 - hence the *= convention
			cur['valuation'] *= cur['tangibleBV']*(1+DEFAULT_TBV_MARKUP);

		});


	}
	else {

		//loop through the bank data array passed in an update the valuations, based on the valueOnComps function logic
		valueOnComps(arr);

	}

}

function ableToAcquire(bank) {

	//placeholder - return false if the bank can't acquire for various reasons TBD
	return true

}

//test merger fit for all banks in the passed array
function mergerModel(bank, bankIndex, bankData, bankArr){


	//test bank against entire loop, but first ensure that we aren't merging a bank with itself
	let dataSet = bankArr.filter((cur, ind) => bank != bankArr[ind]['name']);

	//filter out banks that are bigger than the bank being evaluated as an ACQUIRER - only buy smaller or equal size banks
	dataSet = dataSet.filter((cur, ind) => bankArr[ind]['assets'] <= bankArr[bankIndex]['assets']);

	//in this loop, the acquirer (bank variable) attempts to acquire each bank in the list 
	//the loop first attemps an all stock acquisition, if this fails, it attemps a mixed consideration acquisition, and if this fails
	//it attempts a cash deal
	dataSet.forEach((cur, ind) => {

		//trigger variable - if this gets set to true, we log the successful deal opportunity and exit the iteration
		let merged = false;
		let dealStructure = '';

		merged = allStockAcquisition(bankData, cur);
		if (merged) dealStructure = 'all-stock';
			//do nothing - can't merge a bank with itself

		if (merged === false) {

			merged = mixedConsiderationAcquisition(bankData, cur);
			if (merged) dealStructure = 'mixed';

		}
		else if (merged === false) {

			merged = allCashAcquisition(bankData, cur);
			if (merged) dealStructure = 'all-cash';

		}

		if (merged === true) {
		console.log(bankData['name'] + ' and ' + cur['name'] + ((merged === true) ? 'merged' : 'did not merge') + ' with structure:' );
	}
});
}

function allStockAcquisition(bank, target) {

	let dealType = 'allStock';

	let exchangeRatio = calcExchangeRatio(target['valuation'], target['dilutedShares'],bank['sharePrice']);
	
	let adjustedShares = newTotalShares(target['dilutedShares'], exchangeRatio, bank['dilutedShares'], dealType);
	// console.log('Acquirer Shares ' + bank['dilutedShares']);
	// console.log('New Shares ' + (adjustedShares - bank['dilutedShares']));
	// console.log('Adj shares ' + adjustedShares);

	let purchasePriceOutcome = purchasePriceAllocation(adjustedShares, dealType, bank, target);
	console.log('ppa outcome ' + purchasePriceOutcome);
	//if its ~ truthy, then return true here...else let's return false and move on

	if (purchasePriceOutcome === true) {
		return true
	}
	else return false
}

function mixedConsiderationAcquisition(bank, target) {

	let dealType = 'mixed';

	//calculate an exchange ratio based on the value to be redeemed in new stock
	let targetValueInStock = target['valuation']*(1-MIXED_CONSIDERATION_CASH);
	let exchangeRatio = calcExchangeRatio(targetValueInStock, target['dilutedShares'],bank['sharePrice']);

	let adjustedShares = newTotalShares(target['dilutedShares'], exchangeRatio, bank['dilutedShares'], dealType);

	return false

}

function allCashAcquisition(bank, target) {

	return false
}

function calcExchangeRatio(targetValuation, targetShares, acquirierPrice){

	let ratio = (targetValuation / targetShares) / (acquirierPrice);
	return ratio

}

function newTotalShares(targetShares, ratio, acquirerShares, dealType) {

	let shareCount = acquirerShares;

	if (dealType === 'allStock'){

		shareCount += targetShares*ratio;

	}
	else if (dealType === 'mixed') {

		shareCount += targetShares*ratio*(1-MIXED_CONSIDERATION_CASH);

	}

	//since there are 3 permutations in the beta - all stock, mixed, or cash - the 3rd case is cash and thus no new shares issued
	return shareCount

};

//determine whether the deal will pass eps accretion and tbvs dilution hurdles
function purchasePriceAllocation(adjustedShares, dealType, bank, target) {

	//assumes that entire company is purchased
	let purchasePrice = target['valuation'];

	//purchase cash
	let purchaseCash = (dealType === 'stock') ? 0 : ((dealType === 'mixed') ? purchasePrice*(MIXED_CONSIDERATION_CASH) : purchasePrice);

	//core deposit intangible
	let CDI = target['coreDeposits'] * CDI_RATE;

	//DTL from the CDI
	let CDI_DTL = CDI * MARGINAL_TAX_RATE;  //CONFIRM THAT CDI GIVES A DTA

	//loan credit mark
	let loanMark = target['allowance']*(1+ALL_MARK_PERCENTAGE); //since we are writing off the ALL and then some

	//OREO credit mark
	let oreoMark = target['oreo']*OREO_MARK;

	//calculate the target's net identifiable assets
	let targetNetAssets = target['equity'] - target['totalIntangible'];  //CONFIRM THAT ALL INTANGIBLE SHOW UP IN TOTAL INTANGIBLES!!

	//calculate DTA resulting from credit write-downs - don't get one if a stock deal
	let creditMarkDTA = creditDeferredTax(loanMark, oreoMark, dealType);

	//calculate transaction costs and then figure out how much to account for at close
	let tranCost = target['equity']*TRANSACTION_COST_RATE;
	let tranCostCloseAdjustment = tranCost * TRAN_COST_REALIZED_AT_CLOSE;

	//caluclate the target's net adjusted asset value
				//watch items - CDI DTL not occuring / being different if consideration mix diff
				//adding other intangibles and adjustments into this equation
				//THIS ASSUMES THE TRAN COSTS BOURNE BY SELLER....
	let netAssetValue = targetNetAssets - loanMark - oreoMark + CDI + target['allowance'] + creditMarkDTA - CDI_DTL - tranCostCloseAdjustment;

	//calculate goodwill from the transaction
	let transactionGoodwill = purchasePrice - netAssetValue

	//calculate TBV per share
	let acquirerTBV = bank['equity'] - bank['totalIntangible'];
	let targetTBV = netAssetValue - transactionGoodwill;
	let tbvPerShare = (acquirerTBV + targetTBV) / adjustedShares;
	let acquirerTBVPS = acquirerTBV / bank['dilutedShares'];
	let combinedTBVPS = (acquirerTBV + targetTBV) / adjustedShares;

	//calculate EPS data
		//for now, it does not consider revenue synergies
	let costSynergies = target['nie'] * NIE_SYNERGY_RATE;
	let revenueSynergies = 0;
	let cashOppCost = purchaseCash * CASH_OPP_COST_RATE; //TWEAK THIS FOR CASH DEALS!!!!

	let combinedEarnings = bank['calcEPS']*(1+EPS_GROWTH_RATE) + target['calcEPS']*(1+EPS_GROWTH_RATE) + costSynergies + revenueSynergies - cashOppCost;
	let combinedEPS = combinedEarnings / adjustedShares;

	let epsAccretion = (combinedEPS - bank['calcEPS']) / bank['calcEPS'];

	let passEPSAccretionCheck = (epsAccretion >= EPS_ACCRETION_HURDLE) ? true : false;

	let tbvDilution = tbvDilutionCheck(acquirerTBVPS, combinedTBVPS, bank['calcEPS'], combinedEPS)

	let tbvOutcome = (tbvDilution <= TBV_PAYBACK_CEILING) ? true : false;

	//figure out whether it passed!
	if (passEPSAccretionCheck === true && tbvOutcome === true) {
		return true
	}
	else return false
}

function creditDeferredTax(loanMark, oreoMark, dealType) {

	let creditMarkDTA = 0;

	if (dealType != 'cash') {

		creditMarkDTA = (loanMark + oreoMark) * MARGINAL_TAX_RATE;

	}

	return creditMarkDTA;

}

function tbvDilutionCheck(acquirerTBVPS, combinedTBVPS, acquirerEPS, combinedEPS) {

	 let dilution = combinedTBVPS - acquirerTBVPS;

	 if (dilution >= 0) {
	 	return 0
	 }
	 else {

	 	return (combinedTBVPS / combinedEPS)

	 }

}


//to mass create bank objects from data import
function BankConstructor(arr){

	this.snlKey = arr[0];  //snl id
	this.name = arr[1]; //bank name
	this.ticker = arr[2]; //stock symbol
	this.pTBV = parseFloat(arr[3]); //price to tbv as of data improt date
	this.marketCap = !isNaN(parseFloat(arr[4])*1000) ? parseFloat(arr[4])*1000 : parseFloat(arr[6])* parseInt(arr[12]) / 1000 ; //units from SNL = millions, so converted to 1000s
	this.pe = parseFloat(arr[5]); // last twelve months "LTM" eps
	this.sharePrice = parseFloat(arr[6]); //price per common equity share as of data import date
	//this.fedID = arr[7];
	this.state = arr[8];
	this.city = arr[9];
	this.region = arr[10];
	this.exchange = arr[11]; //stock exchanged on which firm trades.... 
	this.dilutedShares = parseInt(arr[12]) / 1000; //diluted common equity shares outstanding - have to convert from actual to 000s
	this.eps = parseFloat(arr[13]); //earnings per share after extraodinary items, as reported
	this.assets = parseFloat(arr[14]); //total assets
	this.cash = parseFloat(arr[15]); //cash and equivalents - due from banks, fed funds, reverse repo
	this.securities = parseFloat(arr[16]); //securities held by bank - eg bonds
	this.loans = parseFloat(arr[17]); //gross loans held by bank 
	this.allowance = parseFloat(arr[18]); //allowance for loan loss reserves
	this.goodwill = parseFloat(arr[19]); //goodwill 
	this.totalIntangible = parseFloat(arr[20]); //total intangible assets, including goodwill, held by the bank
	this.deposits = parseFloat(arr[21]); //total deposits
	this.coreDeposits = parseFloat(arr[22]); //total deposits less time deposits over $100K and foreigh and unclassified deposits
	this.equity = parseFloat(arr[23]); //total equity including Pref & MI
	this.rwa = parseFloat(arr[24]); //risk weighted assets
	this.capitalRatio = parseFloat(arr[25]); //total risk based capital ratio   .. this is an integer-format percentage
	this.leverageRatio = parseFloat(arr[26]); //basel 3 leverage ratio  .. this is an integer-format percentage
	this.npl = parseFloat(arr[27]); //total non-performing loans
	this.oreo = parseFloat(arr[28]); //other reale state owned..."OREO"
	this.nie = parseFloat(arr[29]); //total non-interest expense
	this.netIncome = parseFloat(arr[30]);
	this.calcEPS = parseFloat(arr[30]) / (parseInt(arr[12]) / 1000); //to check and make sure that eps # provided is reasonable..
	this.valuation = 1;
	this.tangibleBV = parseFloat(arr[23]) - parseFloat(arr[20]); //equity less intangibles = TBV
	this.acquisitionTargets = [];
	this.buyerTargets = [];

	//issues: msa - HAD TO DELETE COLUMN...COMMOAS KEPT LEADING TO SUBSEQUENT FIELD OFFSETS
	//future - stock exchange will need to be error checked since non-public firms would return a null/undefined


}	

