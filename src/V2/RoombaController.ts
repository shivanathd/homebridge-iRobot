import dorita980 from 'dorita980';


export class RoombaV1 {
  public roomba = new dorita980(this.blid, this.password, this.ip, 1);

  constructor(private readonly blid: string, private readonly password: string, private readonly ip: string) {
    //super(blid, password, ip, 1);
  }

  async start() {
    await this.roomba.start();
  }

  async pause() {
    await this.roomba.pause();
  }

  async stop() {
    await this.roomba.stop();
  }

  async resume() {
    await this.roomba.resume();
  }

  async dock() {
    await this.roomba.dock();
  }

  async getMission(): Promise<MissionV1> {
    return new Promise((resolve, reject) => {
      this.roomba.getMission().then(mission => {
        mission.ok.missionFlags.binPresent = !mission.ok.missionFlags.binRemoved;
        resolve(Object.assign(mission.ok, mission.ok.missionFlags));
      }).catch(err => reject(err));
    });
  }
}
export interface MissionV1 {
  ok: {
    //flags: number;
    cycle: 'none' | 'clean';
    phase: 'charge' | 'stuck' | 'run';
    batPct: number;
    idle: boolean;
    binFull: boolean;
    //binRemoved: boolean;
    binPresent: boolean;
    //beeping: boolean;
    //missionFlags: { idle: boolean; binFull: boolean; binRemoved: boolean; beeping: boolean };
    //notReadyMsg: 'Ready';
  };
  //id: number;

}

//------------------------------------------------------------------------------------------------------------------------------------------

export class RoombaV2 {
  private connected = false;
  public roomba?: dorita980;

  constructor(private readonly blid: string, private readonly password: string, private readonly ip: string) {
    //super(blid, password, ip, 2);
  }

  connect(): Promise<dorita980> {
    return new Promise((resolve) => {
      if (!this.connected) {
        this.roomba = new dorita980(this.blid, this.password, this.ip, 2);
        this.roomba.on('offline', () => {
          this.connected = false;
          this.roomba.end();
        }).on('close', () => {
          this.connected = false;
        }).on('connect', () => {
          this.connected = true;
          resolve(this.roomba);
        });
      } else {
        resolve(this.roomba);
      }
    });
  }

  clean() {
    this.connect().then(async (roomba) => {
      await roomba.clean();
      await roomba.end();
    });
  }

  pause() {
    this.connect().then(async (roomba) => {
      await roomba.pause();
      await roomba.end();
    });
  }

  stop() {
    this.connect().then(async (roomba) => {
      await roomba.stop();
      await roomba.end();
    });
  }

  resume() {
    this.connect().then(async (roomba) => {
      await roomba.resume();
      await roomba.end();
    });
  }

  dock() {
    this.connect().then(async (roomba) => {
      await roomba.dock();
      await roomba.end();
    });
  }

  find() {
    this.connect().then(async (roomba) => {
      await roomba.find();
      await roomba.end();
    });
  }

  async getMission(): Promise<MissionV2> {
    const mission: MissionV2 = {
      cycle: 'none',
      phase: 'charge',
      batPct: 99,
      binPresent: true,
      binFull: false };
    return new Promise((resolve, reject) => {
      this.connect().then(async (roomba) => {
        roomba.getRobotState(['cleanMissionStatus', 'bin', 'batPct'])
          .then(state => resolve(Object.assign(mission, state.cleanMissionStatus, state.bin, state)))
          .catch(err => reject(err));
      });
    });
  }
}
export interface MissionV2 {
  cycle: 'none' | 'clean';
  phase: 'charge' | 'stuck' | 'run' | 'hmUsrDock';
  batPct: number;
  binPresent: boolean;
  binFull: boolean;
}