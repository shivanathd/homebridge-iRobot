import request from 'request';
import { createSocket } from 'dgram';
import { PlatformConfig } from 'homebridge';
export function getRoombas(config: PlatformConfig): Promise<ConfiguredRoomba[]> {
  let index = 0;
  return new Promise((resolve, reject) => {
    const robots: ConfiguredRoomba[] = [];
    if (config.password !== undefined && config.email !== undefined) {
      getiRobotDevices(config.email, config.password).then(devices => {
        for (const robot of devices) {
          getDeviceCredentials(robot.blid).then(credentials => {
            robots.push(Object.assign(robot, credentials));
          }).catch(() => {
            //do nothing
          }).then(() => {
            index++;
            if (index === devices.length) {
              resolve(robots);
            }
          });
        }
      }).catch(error => {
        reject(error);
      });
    } else {
      for (const robot of config.roombas) {
        if (robot.ip !== undefined) {
          getDeviceCredentials(robot.blid, robot.ip).then(credentials => {
            robots.push(Object.assign(robot, credentials));
          }).catch(() => {
            //do nothing
          }).finally(() => {
            index++;
            if (index === robots.length) {
              resolve(robots);
            }
          });
        } else {
          getDeviceCredentials(robot.blid).then(credentials => {
            robots.push(Object.assign(robot, credentials));
          }).catch(() => {
            //do nothing
          }).finally(() => {
            index++;
            if (index === robots.length) {
              resolve(robots);
            }
          });

        }
      }
    }
  });
}


function getDeviceCredentials(blid: string, ip?: string): Promise<ConfiguredRoomba> {
  return new Promise((resolve, reject) => {
    let broadcastInterval;
    const server = createSocket('udp4');

    server.on('error', (err) => {
      reject(err);
      //console.error(err);
    });

    server.on('message', (msg) => {
      try {
        const parsedMsg = JSON.parse(msg.toString());
        if (parsedMsg.hostname && parsedMsg.ip &&
          ((parsedMsg.hostname.split('-')[0] === 'Roomba') || (parsedMsg.hostname.split('-')[0] === 'iRobot'))) {
          if (parsedMsg.hostname.split('-')[1] === blid) {
            clearInterval(broadcastInterval);
            server.close();
            for(const key in parsedMsg.sw.split('')){
              if(key === '1'){
                parsedMsg.swMajor = 1;
                resolve(parsedMsg);
              } else if(key === '2'){
                parsedMsg.swMajor = 2;
                resolve(parsedMsg);
              } else if(key === '3'){
                parsedMsg.swMajor = 3;
                resolve(parsedMsg);
              } 
            }
            parsedMsg.swMajor = 2;
            resolve(parsedMsg);
            //console.log(JSON.stringify(parsedMsg));
            //process.exit(0);
          }
        }
      } catch (e) {
        reject(e);
      }
    });
    /*
        server.on('listening', () => {
            setTimeout(()=>{
                //console.log(child_process.execFileSync(__dirname + '/getRoombaIP.js', [blid, attempt+1]).toString());
                //process.exit(0);
            }, 5000);
        });
        */

    server.bind(() => {
      const message = Buffer.from('irobotmcs');
      server.setBroadcast(ip === undefined);
      server.send(message, 0, message.length, 5678, ip || '255.255.255.255');
      let attempts = 0;
      broadcastInterval = setInterval(() => {
        attempts++;
        if (attempts > 5) {
          reject('No Roomba Found');
          clearInterval(broadcastInterval);
        } else {
          server.send(message, 0, message.length, 5678, ip || '255.255.255.255');
        }
      }, 5000);
    });

  });
}


function getiRobotDevices(email: string, password: string): Promise<Roomba[]> {
  return new Promise((resolve, reject) => {
    const apiKey = '3_rWtvxmUKwgOzu3AUPTMLnM46lj-LxURGflmu5PcE_sGptTbD-wMeshVbLvYpq01K';

    const gigyaLoginOptions = {
      'method': 'POST',
      'uri': 'https://accounts.us1.gigya.com/accounts.login',
      'json': true,
      'qs': {
        'apiKey': apiKey,
        'targetenv': 'mobile',
        'loginID': email,
        'password': password,
        'format': 'json',
        'targetEnv': 'mobile',
      },
      'headers': {
        'Connection': 'close',
      },
    };

    request(gigyaLoginOptions, loginGigyaResponseHandler);

    function loginGigyaResponseHandler(error, response, body) {
      if (error) {
        reject('Fatal error login into Gigya API. Please check your credentials or Gigya API Key.');
        //console.log('Fatal error login into Gigya API. Please check your credentials or Gigya API Key.');
        //console.log(error);
        //process.exit(0);
      }
      if (response.statusCode === 401 || response.statusCode === 403) {
        reject('Authentication failed. Please check your credentials');
        //console.log('Authentication error. Check your credentials.');
        //console.log(response);
        //process.exit(0);
      } else if (response.statusCode === 400) {
        reject(response);
        //console.log(response);
        //process.exit(0);
      } else if (response.statusCode === 200) {
        if (body && body.statusCode && body.statusCode === 403) {
          reject('Authentication error. Please check your credentials.');
          //console.log('Authentication error. Please check your credentials.');
          //console.log(body);
          //process.exit(0);
        }
        if (body && body.statusCode && body.statusCode === 400) {
          reject('Error loging into Gigya API.');
          //console.log('Error login into Gigya API.');
          //console.log(body);
          //process.exit(0);
        }
        if (body && body.statusCode && body.statusCode === 200 && body.errorCode === 0 && body.UID && body.UIDSignature &&
          body.signatureTimestamp && body.sessionInfo && body.sessionInfo.sessionToken) {
          const iRobotLoginOptions = {
            'method': 'POST',
            'uri': 'https://unauth2.prod.iot.irobotapi.com/v2/login',
            'json': true,
            'body': {
              'app_id': 'ANDROID-C7FB240E-DF34-42D7-AE4E-A8C17079A294',
              'assume_robot_ownership': 0,
              'gigya': {
                'signature': body.UIDSignature,
                'timestamp': body.signatureTimestamp,
                'uid': body.UID,
              },
            },
            'headers': {
              'Connection': 'close',
            },
          };
          request(iRobotLoginOptions, loginIrobotResponseHandler);
        } else {
          reject('Error logging into iRobot account. Missing fields in login response.');
          //console.log('Error login into iRobot account. Missing fields in login response.');
          //console.log(body);
          //process.exit(0);
        }
      } else {
        reject('Unespected response.');
        //console.log('Unespected response. Checking again...');
      }
    }

    function loginIrobotResponseHandler(error, response, body) {
      if (error) {
        reject('Fatal error login into iRobot account. Please check your credentials or API Key.');
        //console.log('Fatal error login into iRobot account. Please check your credentials or API Key.');
        //console.log(error);
        //process.exit(0);
      }
      if (body && body.robots) {
        const robots: Roomba[] = [];
        Object.keys(body.robots).map((key) => {
          const robot: Roomba = body.robots[key];
          robot.blid = key;
          robots.push(robot);
        });
        resolve(robots);
      } else {
        reject('Fatal error login into iRobot account. Please check your credentials or API Key.');
        //console.log('Fatal error login into iRobot account. Please check your credentials or API Key.');
        //console.log(body);
        //process.exit(0);
      }
    }
  });

}
interface Roomba {
  name: string;
  blid: string;
  password: string;
  ver: '1' | '2' | '3';
  sku: string;
  softwareVer: string;
  cap: unknown;
  svcDeplId: string;
  user_cert: boolean;
}
export interface ConfiguredRoomba {
  name: string;
  ip: string;
  blid: string;
  password: string;
  ver: '1' | '2' | '3';
  sku: string;
  softwareVer: string;
  cap: unknown;
  svcDeplId: string;
  user_cert: boolean;
  hostname: string;
  robotname: string;
  robotid?: string;
  mac: string;
  sw: string;
  nc: number;
  proto: string;
  swMajor: number;
}
