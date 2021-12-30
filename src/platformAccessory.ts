import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { Robot } from './getRoombas';
import dorita980 from 'dorita980';

import { iRobotPlatform } from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class iRobotPlatformAccessory {
  private service: Service;
  private battery: Service;
  private stuck!: Service;
  private binFilter!: Service;
  private binContact!: Service;
  private binMotion!: Service;
  private rooms!: Service[];


  private binConfig: string[] = this.device.multiRoom && this.platform.config.ignoreMultiRoomBin ? [] : this.platform.config.bin.split(':');
  private roomba;
  private active = false;
  private lastStatus = { cycle: '', phase: '' };
  private lastCommandStatus = {pmap_id: null};
  private state = 0;
  private binfull = 0;
  private batteryStatus = { 'low': false, 'percent': 50, 'charging': true };
  private stuckStatus = false;

  constructor(
    private readonly platform: iRobotPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly device: Robot,
  ) {
    this.configureRoomba();

    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'iRobot')
      .setCharacteristic(this.platform.Characteristic.Model, this.device.model || 'N/A')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, 'N/A')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, device.info.sw || device.info.ver || 'N/A')
      .getCharacteristic(this.platform.Characteristic.Identify).on('set', this.identify.bind(this));


    this.service = this.accessory.getService(this.device.name) ||
      this.accessory.addService(this.platform.Service.Fanv2, this.device.name, 'Main-Service');

    if(this.device.multiRoom){
      this.accessory.context.map.regions.forEach(region => {
        this.rooms[region.id] = this.accessory.getService('Room '+ region.id) ||
      this.accessory.addService(this.platform.Service.Switch, 'Room '+ region.id, region.id);
      });
    }


    if (this.binConfig.includes('filter')) {
      this.binFilter = this.accessory.getService(this.device.name + '\'s Bin Filter') ||
        this.accessory.addService(this.platform.Service.FilterMaintenance, this.device.name + '\'s Bin Filter', 'Filter-Bin');
    }
    if (this.binConfig.includes('contact')) {
      this.binContact = this.accessory.getService(this.device.name + '\'s Bin Contact Sensor') ||
        this.accessory.addService(this.platform.Service.ContactSensor, this.device.name + '\'s Bin Contact Sensor', 'Contact-Bin');
    }
    if (this.binConfig.includes('motion')) {
      this.binMotion = this.accessory.getService(this.device.name + '\'s Bin Motion Sensor') ||
        this.accessory.addService(this.platform.Service.MotionSensor, this.device.name + '\'s Bin Motion Sensor', 'Motion-Bin');
    }


    this.battery = this.accessory.getService(this.device.name + '\'s Battery') ||
      this.accessory.addService(this.platform.Service.Battery, this.device.name + '\'s Battery', 'Battery-Service');

    if (!this.platform.config.hideStuckSensor) {
      this.stuck = this.accessory.getService(this.device.name + ' Stuck') ||
        this.accessory.addService(this.platform.Service.MotionSensor, this.device.name + ' Stuck', 'Stuck-MotionSensor');
    }
    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    /*this.service.setCharacteristic(this.platform.Characteristic.Name, this.device.name);

    if(this.binConfig.includes('filter')){
      this.binFilter.setCharacteristic(this.platform.Characteristic.Name, this.device.name + '\'s Bin');
    }
    if(this.binConfig.includes('contact')){
      this.binContact.setCharacteristic(this.platform.Characteristic.Name, this.device.name + '\'s Bin');
    }
    if(this.binConfig.includes('motion')){
      this.binMotion.setCharacteristic(this.platform.Characteristic.Name, this.device.name + '\'s Bin');
    }

    this.battery.setCharacteristic(this.platform.Characteristic.Name, this.device.name + '\'s Battery');
    this.stuck.setCharacteristic(this.platform.Characteristic.Name, this.device.name + ' Stuck');
*/


    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    this.service.getCharacteristic(this.platform.Characteristic.Active)
      .onSet(this.set.bind(this))                // SET - bind to the `setOn` method below
      .onGet(this.get.bind(this));               // GET - bind to the `getOn` method below
    this.service.getCharacteristic(this.platform.Characteristic.CurrentFanState)
      .onGet(this.getState.bind(this)); // GET - bind to the
    if (this.device.multiRoom) {
      this.service.getCharacteristic(this.platform.Characteristic.TargetFanState)
        .onGet(this.getMode.bind(this)) // GET
        .onSet(this.setMode.bind(this));
    }

    if (this.binConfig.includes('filter')) {
      this.binFilter.getCharacteristic(this.platform.Characteristic.FilterChangeIndication)
        .onGet(this.getBinfull.bind(this));
    }
    if (this.binConfig.includes('contact')) {
      this.binContact.getCharacteristic(this.platform.Characteristic.ContactSensorState)
        .onGet(this.getBinfull.bind(this));
    }
    if (this.binConfig.includes('motion')) {
      this.binMotion.getCharacteristic(this.platform.Characteristic.MotionDetected)
        .onGet(this.getBinfullBoolean.bind(this));
    }


    this.battery.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onGet(this.getBatteryStatus.bind(this));
    this.battery.getCharacteristic(this.platform.Characteristic.BatteryLevel)
      .onGet(this.getBatteryLevel.bind(this));
    this.battery.getCharacteristic(this.platform.Characteristic.ChargingState)
      .onGet(this.getChargeState.bind(this));


    if (!this.platform.config.hideStuckSensor) {
      this.stuck.getCharacteristic(this.platform.Characteristic.MotionDetected)
        .onGet(this.getStuck.bind(this));
    }
    /*this.battery.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
      .onSet(this.get)
      */
    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

    // Example: add two "motion sensor" services to the accessory
    /*
    const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
      this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
      this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');
/*
    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    //let motionDetected = false;
  }

  async configureRoomba() {
    this.roomba = null;
    this.accessory.context.connected = false;
    this.roomba = new dorita980.Local(this.device.blid, this.device.password, this.device.ip/*, 2, this.config.interval*/);
    this.roomba.on('connect', () => {
      this.accessory.context.connected = true;
      this.platform.log.info('Succefully connected to roomba', this.device.name);
    }).on('offline', () => {
      this.accessory.context.connected = false;
      this.platform.log.warn('Roomba', this.device.name, ' went offline, reconnecting in 3 seconds');
      setTimeout(() => {
        this.roomba.end();
      }, 3000);
    }).on('close', () => {
      this.accessory.context.connected = false;
      this.platform.log.warn('Roomba', this.device.name, ' connection closed, atempting to reconnect...');
      this.roomba.removeAllListeners();
      this.configureRoomba();
    }).on('state', (data) => {
      this.updateRoombaState(data);
    });
  }

  updateRoombaState(data) {
    if (data.cleanMissionStatus.cycle !== this.lastStatus.cycle || data.cleanMissionStatus.phase !== this.lastStatus.phase) {
      this.platform.log.debug(this.device.name + '\'s mission update:',
        '\n cleeanMissionStatus:', JSON.stringify(data.cleanMissionStatus, null, 2),
        '\n batPct:', data.batPct,
        '\n bin:', JSON.stringify(data.bin, null, 2),
        '\n lastCommand:', JSON.stringify(data.lastCommand, null, 2));
    }
    if ((this.device.multiRoom && data.lastCommand.pmap_id !== null) && data.lastCommand.pmap_id !== this.lastCommandStatus.pmap_id) {
      //this.platform.log.debug('Updating map for roomba:', this.device.name);
      this.updateMap(data.lastCommand);
    }

    this.lastStatus = data.cleanMissionStatus;
    this.lastCommandStatus = data.lastCommand;
    /*------------------------------------------------------------------------------------------------------------------------------------*/

    this.active = this.getHomekitActive(data.cleanMissionStatus);

    this.state = this.active ? 2 : this.getEveInactive(data.cleanMissionStatus) ? 0 : 1;

    this.binfull = data.bin.full ? 1 : 0;

    this.stuckStatus = data.cleanMissionStatus.phase === 'stuck';

    this.batteryStatus.charging = data.cleanMissionStatus.phase === 'charge';
    this.batteryStatus.low = data.batPct < (this.platform.config.lowBattery || 20);
    this.batteryStatus.percent = data.batPct;
    /*------------------------------------------------------------------------------------------------------------------------------------*/
    this.service.updateCharacteristic(this.platform.Characteristic.Active, this.active ? 1 : 0);

    this.service.updateCharacteristic(this.platform.Characteristic.CurrentFanState, this.state);

    if (this.binConfig.includes('filter')) {
      this.binFilter.updateCharacteristic(this.platform.Characteristic.FilterChangeIndication, this.binfull);
    }
    if (this.binConfig.includes('contact')) {
      this.binContact.updateCharacteristic(this.platform.Characteristic.ContactSensorState, this.binfull);
    }
    if (this.binConfig.includes('motion')) {
      this.binMotion.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.binfull === 1);
    }

    this.stuck.updateCharacteristic(this.platform.Characteristic.MotionDetected, this.stuckStatus);

    this.battery.updateCharacteristic(this.platform.Characteristic.BatteryLevel, this.batteryStatus.percent);
    this.battery.updateCharacteristic(this.platform.Characteristic.StatusLowBattery, this.batteryStatus.low);
    this.battery.updateCharacteristic(this.platform.Characteristic.ChargingState, this.batteryStatus.charging);
  }

  updateMap(lastCommand) {
    if (this.accessory.context.map === undefined) {
      this.platform.log.info('Creating new map for roomba:', this.device.name);
      this.accessory.context.map = {
        'pmap_id': lastCommand.pmap_id,
        'regions': lastCommand.regions,
        'user_pmapv_id': lastCommand.user_pmapv_id,
      };
    } else {
      if(!this.accessory.context.map.regions.includes(lastCommand.regions)){
        this.platform.log.info('Adding new region(s) for roomba:', this.device.name, '\n', lastCommand.regions);
        this.accessory.context.map.regions.push(lastCommand.regions);
      }
      this.platform.log.debug(this.device.name + '\'s map update:',
        '\n map:', JSON.stringify(this.accessory.context.map, null, 2));
    }
  }



  getHomekitActive(cleanMissionStatus): boolean {
    const configStatus: string[] | boolean[] = this.platform.config.status.split(':');
    switch (configStatus[0]) {
      case true:
        return true;
      case false:
        return false;
      case 'inverted':
        return cleanMissionStatus[configStatus[1] as string] !== configStatus[2];
      default:
        return cleanMissionStatus[configStatus[0] as string] === configStatus[1];
    }
  }

  getEveInactive(cleanMissionStatus): boolean {
    const configStatus: string[] | boolean[] = this.platform.config.eveStatus.split(':');
    switch (configStatus[0]) {
      case true:
        return true;
      case false:
        return false;
      case 'inverted':
        return cleanMissionStatus[configStatus[1] as string] !== configStatus[2];
      default:
        return cleanMissionStatus[configStatus[0] as string] === configStatus[1];
    }
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async get(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'To', this.active ? 'On' : 'Off');
    return this.active ? 1 : 0;
  }

  async getState(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'Mode To', this.state === 0 ? 'Off' : this.state === 1 ? 'Idle' : 'On');
    return this.state;
  }

  async getBinfull(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'Binfull To', this.binfull === 0 ? 'OK' : 'FULL');
    return this.binfull;
  }

  async getBinfullBoolean(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'Binfull To', this.binfull === 0 ? 'OK' : 'FULL');
    return this.binfull === 1;
  }

  async getBatteryLevel(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'Battery Level To', this.batteryStatus.percent);
    return this.batteryStatus.percent;
  }

  async getBatteryStatus(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'Battery Status To', this.batteryStatus.low ? 'Low' : 'Normal');
    return this.batteryStatus.low ? 1 : 0;
  }

  async getChargeState(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'Charge Status To', this.batteryStatus.charging ? 'Charging' : 'Not Charging');
    return this.batteryStatus.charging ? 1 : 0;
  }

  async getMode(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'Mode To Auto');
    return 1;
  }

  async getStuck(): Promise < CharacteristicValue > {
    this.platform.log.debug('Updating', this.device.name, 'Stuck To', this.stuckStatus);
    return this.stuckStatus;
  }



  async identify() {
    if (this.accessory.context.connected) {
      await this.roomba.find();
      this.platform.log.info('Identifying', this.device.name, '(Note: Some Models Won\'t Beep If Docked');
    }
  }



  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  async set(value: CharacteristicValue) {
    if (this.accessory.context.connected) {
      const configOffAction: string[] = this.platform.config.offAction.split(':');
      try {
        if (value === 1) {
          await this.roomba.clean();
        } else {
          await this.roomba[configOffAction[0]]();

          setTimeout(async () => {
            if (configOffAction[1] !== 'none') {
              await this.roomba[configOffAction[1]]();
            }
          }, 500);
        }
        this.platform.log.debug('Set', this.device.name, 'To',
          value === 0 ? configOffAction[0] + (configOffAction[1] !== 'none' ? ' and ' + configOffAction[1] : '') : 'Clean');
      } catch (err) {
        this.platform.log.error('Error Seting', this.device.name, 'To',
          value === 0 ? configOffAction[0] + (configOffAction[1] !== 'none' ? ' and ' + configOffAction[1] : '') : 'Clean');
      }
    }
  }

  async setMode(value: CharacteristicValue) {
    if (this.accessory.context.connected) {
      this.platform.log.debug('Set', this.device.name, 'To', value === 0 ? 'Room-By-Room' : 'Everywhere', '(Support Coming Soon!)');
      this.service.updateCharacteristic(this.platform.Characteristic.TargetFanState, 1);
    }
  }

}
