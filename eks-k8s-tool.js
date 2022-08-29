#!/usr/bin/env node
const AWS = require('aws-sdk');
const k8s = require('@kubernetes/client-node');
const EKSToken = require('aws-eks-token');
var net = require("net")

const yaml = require('js-yaml');
const promisify = require('util.promisify');

const express = require('express');
const googleapis = require('googleapis');
const jwt_decode = require('jwt-decode');
const chalk = require('chalk');
var spawn = require('child_process').spawn;
const execSync = require('child_process').execSync;
const inquirer = require("inquirer");
inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));
var _ = require('lodash');
var fuzzy = require('fuzzy');
const { spawnSync } = require('child_process');
const { PassThrough } = require('stream');
fs = require('fs');

var SystemEnv = process.env;

const debug = false;

const k8sfwdernamespace = 'sql-forwarding';
const awscredentials  = '/tmp/.my.aws.cred';
const awsconfig = '/tmp/.my.aws.cfg';
const awsprofile = 'MY';
const eksprepend = '/tmp/eks-cfg-';
const k8sprepend = '/tmp/.k8s.fwd';
var K8sAccessKeyId = false;
var K8sSecretAccessKey = false;
var K8sSessionToken = false;

SystemEnv.AWS_SHARED_CREDENTIALS_FILE = `${awscredentials}`;
SystemEnv.AWS_CONFIG_FILE = `${awsconfig}`;
SystemEnv.AWS_PROFILE = `${awsprofile}`;


/// google auth related
const { google } = googleapis;
const PORT = 3000;
const LOCALMYSQLPORT = 3306;
const GOOGLE_CLIENT_ID = 'GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = 'GOOGLE_CLIENT_SECRET-5x';
const GOOGLE_REDIRECT = 'http://localhost:3000/callback';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const auth = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT
);
const loginUrl = auth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: GOOGLE_SCOPE,
});

var roles = {'SQLProxy': 'arn:aws:iam::633138364689:role/GoogleOpenIDConnectSqlproxy', 'Developer': 'arn:aws:iam::633138364689:role/GoogleOpenIDConnectDeveloper',  'Admin (devops)': 'arn:aws:iam::633138364689:role/GoogleOpenIDConnectAdmin'};
/// </google

var seperator=chalk.dim('::');


// end of google oidc login part

var myresources = {
  "0123456": {
    "name": "account 1",
    "clusters": {
          "eks-account1-prod": {
              "config": "base64-encoded k8s config",
              "rds": [
                  "rds-name.rds.amazonaws.com"
                ],
                "customers": 
                  {"big client": {"staging": "namespace-staging"}
                }
              },
      }
  },
  "4567890": {
    "name": "another account",
    "clusters": {
          "eks-whatever-prod": {
            "config": "base64-encoded k8s config",
            "rds": [
                "rds-name.rds.amazonaws.com"
              ],
              "customers": 
                {"small client": {"dev": "namespace-dev"}
              }
            },
      }
  },
  "1929319239123": {
    "name": "one more account",
    "clusters": {
          "eks-blah-staging": {
            "config": "base64-encoded k8s config",
            "rds": [
                "rds-name.rds.amazonaws.com"
              ],
              "customers": 
                {"easy client": {"prod": "namespace-prod"}
              }
            }
      }
  },
  "9494949192002": {
    "name": "happy client",
    "clusters": {
          "eks-shark-develop": {
            "config": "base64-encoded k8s config",
            "rds": [
                "rds-name.rds.amazonaws.com"
              ],
              "customers": 
                {"shark": {"dev": "namespace-dev"}
                }
              },
          "eks-shark-prod": {
            "config": "base64-encoded k8s config",
            "rds": [
                "rds-name.rds.amazonaws.com"
              ],
              "customers": 
                {"shark": {"prod": "namespace-prod"}
              }
            },
          "eks-shark-staging": {
            "config": "base64-encoded k8s config",
            "rds": [
                "rds-name.rds.amazonaws.com"
              ],
              "customers": 
                {"shark": {"staging": "namespace-staging"}
              }
              },
      }
  },
};
// print(json.dumps(k8sclusters, indent=4, sort_keys=True))

var gauthchoices=['no','yes'];
var choicesrds = [];
var choicesrdsfull = [];
var choiceseks = [];
var choiceseksbackoffice = [];
var rolechoices = [];

for (const [key, value] of Object.entries(roles)) {
  rolechoices.push(key)
}

function pad(padlength, str, padLeft) {
  var pad = Array(padlength).join(' ');
  if (typeof str === 'undefined') 
    return pad;
  if (padLeft) {
    return (pad + str).slice(-pad.length);
  } else {
    return (str + pad).substring(0, pad.length);
  }
}


for (const [key, value] of Object.entries(myresources)) {
    accountid=key;
    for (const [key2, value2] of Object.entries(value)) {
      if ('name' == key2) { accountname=value2; }
      if ('clusters' == key2) {
        for (const [clusterkey, clustervalue] of Object.entries(value2)) {
          // create EKS list
          var customerfound=""
          if (clustervalue['customers']){
            if (clustervalue['customers'] && Object.keys(clustervalue['customers']).length > 0 ) {
              customerfound=Object.keys(clustervalue['customers'])
        }                          
          }
          ekscluster=chalk.bgBlack(chalk.white(chalk.bold(clusterkey)))
          choiceseks.push(`${customerfound}${seperator}${ekscluster}${seperator}${accountid}`)
          

          for (const [ekskey, eksvalue] of Object.entries(clustervalue)) {
            if ('config' == ekskey) {
              let buff = new Buffer.from(eksvalue, 'base64');
              let decodedconfig = buff.toString('ascii');
    
              fs.writeFileSync(`${eksprepend}${stripansi(accountid)}-${stripansi(clusterkey)}.k8sconfig`, decodedconfig, function (err) {
                if (err) return console.log(err);
              });
            };

            if ('rds' == ekskey && eksvalue.length > 0) {
              for (const rdscluster of eksvalue) {  
                if (rdscluster) {
                  // create RDS list
                  var customerfound=""
                      if (clustervalue['customers']){
                        if (clustervalue['customers'] && Object.keys(clustervalue['customers']).length > 0 ) {
                          customerfound=Object.keys(clustervalue['customers'])
                        }                          
                      }
                  rdsclustername=chalk.yellow(chalk.bold(rdscluster));
                  choicesrds.push(`${ekscluster}${seperator}${customerfound}`)
                  choicesrdsfull.push(`${customerfound}${seperator}${ekscluster}${seperator}${rdsclustername}${seperator}${accountid}`)
                  }
                }
            };

            if ('customers' == ekskey) {
              if (eksvalue && Object.keys(eksvalue).length > 0 ) {
                for (const [wlkey, wlvalue] of Object.entries(eksvalue)) {
                  for (const [bogus1, namespace] of Object.entries(wlvalue)) {
                    customernamespace=chalk.yellow(chalk.bold(namespace));
                    choiceseksbackoffice.push(`${customernamespace}${seperator}${ekscluster}${seperator}${accountid}`)
                    }
                }
              }
            };


          }
         }
      }

    }
};

function stripansi(input) {
  var output = input.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  return output;
};


function RoleLogin(AWS_ROLE_ARN) {
const sts = new AWS.STS();
const app = express();

app.get('/login', (req, res) => res.redirect(loginUrl));

app.get('/callback', async (req, res) => {
  const response = await auth.getToken(req.query.code);
  const { tokens: { id_token }} = response;
  const decoded = jwt_decode(id_token);
  const { sub }  = decoded;
  const params = {
    DurationSeconds: 43200,
    RoleArn: AWS_ROLE_ARN,
    RoleSessionName: sub,
    WebIdentityToken: id_token,
  };
  await sts.assumeRoleWithWebIdentity(params, (err, data) => {
    if (err) {
      console.log(err, err.stack);
      res.status(500).send();
      res.send('login failed')
    } else {
      const { Credentials: { AccessKeyId, SecretAccessKey, SessionToken } } = data;
      var K8sAccessKeyId = AccessKeyId;
      var K8sSecretAccessKey = SecretAccessKey;
      var K8sSessionToken = SessionToken;
      res.send(`SUCCESS - you can close this browser window`)

      fs.writeFileSync(`${awscredentials}`, `[${awsprofile}]\naws_access_key_id = ${AccessKeyId}\naws_secret_access_key = ${SecretAccessKey}\naws_session_token = ${SessionToken}\n`, function (err) {
        if (err) return console.log(err);
      });
       fs.writeFileSync(`${awsconfig}`, `[${awsprofile}]\nregion = ap-east-1\noutput = json\n`, function (err) {
        if (err) return console.log(err);
      });
      console.log('thank you for your patience, please rerun (and select `no` authentication) to get more options');

      process.exit(1)
    }
  });
});
app.listen(PORT, () => require("openurl").open('http://localhost:3000/login') );
};

function searchRDS(answers, input) {
  input = input || '';
  return new Promise(function (resolve) {
    setTimeout(function () {
      var fuzzyResult = fuzzy.filter(input, choicesrds);
      resolve(
        fuzzyResult.map(function (el) {
          return el.original;
        })
      );
    }, _.random(10, 500));
  });
};

function searchEKS(answers, input) {
  input = input || '';
  return new Promise(function (resolve) {
    setTimeout(function () {
      var fuzzyResult = fuzzy.filter(input, choiceseks);
      resolve(
        fuzzyResult.map(function (el) {
          return el.original;
        })
      );
    }, _.random(30, 500));
  });
};

function searcheksbackoffice(answers, input) {
  input = input || '';
  return new Promise(function (resolve) {
    setTimeout(function () {
      var fuzzyResult = fuzzy.filter(input, choiceseksbackoffice);
      resolve(
        fuzzyResult.map(function (el) {
          return el.original;
        })
      );
    }, _.random(30, 500));
  });
};


//if (fs.existsSync(awscredentials)) {} else {console.log("DOES NOT exist:", awscredentials);}
//if (fs.existsSync(awsconfig)) {} else {console.log("DOES NOT exist:", awsconfig);}




inquirer
.prompt([
  {
    type: "list",
    loop: false,
    name: "login",
    default: 'no',
    message: "perform google authentication / refresh keys (will try to open a browser window)",
    choices: gauthchoices
  },
  {
    type: "list",
    loop: false,
    name: "role",
    message: "Role Login",
    choices: rolechoices,
    when: (answers) => answers.login === 'yes'
  },
  {
    type: "list",
    loop: false,
    name: "action",
    message: "What to do",
    choices: ['SQLProxy','Kubectl helper','EKS-Backoffice','EKS-pod-overview'],
    when: (answers) => answers.login === 'no' 
  },
  {
    type: "autocomplete",
    source: searchRDS,
    loop: false,
    pageSize: 10,
    name: "rdscluster",
    message: "RDS cluster",
    choices: choicesrds,
    when: (answers) => answers.action === 'SQLProxy' && answers.login === 'no'
  },
  {
    type: "autocomplete",
    source: searcheksbackoffice,
    loop: false,
    pageSize: 10,
    name: "eksbackoffice",
    message: "EKS-Backoffice",
    choices: choiceseksbackoffice,
    when: (answers) => answers.action === 'EKS-Backoffice'  && answers.login === 'no'
  },
  {
    type: "autocomplete",
    source: searcheksbackoffice,
    loop: false,
    pageSize: 10,
    name: "eksbackoffice",
    message: "EKS-pod-overview",
    choices: choiceseksbackoffice,
    when: (answers) => answers.action === 'EKS-pod-overview'  && answers.login === 'no'
  },
  {
    type: "autocomplete",
    source: searchEKS,
    loop: false,
    pageSize: 10,
    name: "ekscluster",
    message: "EKS cluster",
    choices: choiceseks,
    when: (answers) => answers.action === 'Kubectl helper' && answers.login === 'no'
  }  
  ])

  // finished the questions, now check the results :>
  .then((answers) => { 
    const answer = answers
    var accountid = false
    var ekscluster = false
    var rds = false
    var eksconfig = false
    var etsnamespace = false
      
    if ('rdscluster' in answer) {
      for (const tmpekscheck of choicesrdsfull)
      {
      if (tmpekscheck.includes(answer['rdscluster'].split(seperator)[0])) {
       accountid = stripansi(tmpekscheck.split(seperator)[3]);
       ekscluster = stripansi(answer['rdscluster'].split(seperator)[0]);
       rds = stripansi(tmpekscheck.split(seperator)[2]);
       eksconfig = `${eksprepend}${accountid}-${ekscluster}.k8sconfig`
       }
      }
     console.log(eksconfig, ekscluster)
    }
    if ('ekscluster' in answer) {
      accountid = stripansi(answer['ekscluster'].split(seperator)[2]);
      ekscluster = stripansi(answer['ekscluster'].split(seperator)[1]);
      eksconfig = `${eksprepend}${accountid}-${ekscluster}.k8sconfig`
    }

    if ('eksbackoffice' in answer) {
      accountid = stripansi(answer['eksbackoffice'].split(seperator)[2]);
      ekscluster = stripansi(answer['eksbackoffice'].split(seperator)[1]);
      eksconfig = `${eksprepend}${accountid}-${ekscluster}.k8sconfig`
      etsnamespace=stripansi(answer['eksbackoffice'].split(seperator)[0]);
    }


    if ('login' in answer && (answer['login'] == 'yes') ) { var login = RoleLogin(roles[answer['role']]); if (login) {PassThrough;} } 
    else
    {
    const datacred = fs.readFileSync('/tmp/.ma.aws.cred', 'utf8')
    var K8sAccessKeyId = datacred.split('\n')[1].split(' = ')[1];
    var K8sSecretAccessKey = datacred.split('\n')[2].split(' = ')[1];
    var K8sSessionToken = datacred.split('\n')[3].split(' = ')[1];
    // console.log('auth ', K8sAccessKeyId, K8sSecretAccessKey, K8sSessionToken)
    var ekstoken="";
    EKSToken.config = {
      accessKeyId: K8sAccessKeyId,
      secretAccessKey: K8sSecretAccessKey,
      sessionToken: K8sSessionToken,
      region: 'ap-southeast-1'
    };
    EKSToken.renew('eks-shark-prod').then(token => {
      ekstoken=token;
    });
  }
      cmdprepend=`AWS_SHARED_CREDENTIALS_FILE=${awscredentials} AWS_CONFIG_FILE=${awsconfig} AWS_PROFILE=${awsprofile}`

      if ('action' in answer && (answer['action'] == 'SQLProxy') ) { 
        SystemEnv.KUBECONFIG = eksconfig;
        console.log(chalk.cyan(`preparing your order, please wait`));

        const kc = new k8s.KubeConfig();
        kc.loadFromFile(eksconfig);
        kc['users'].token=ekstoken;

        const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
        // makeApiClient so we can get the podname to feed to the portForwarder that only understands pod-portfwards

        k8sApi.listNamespacedPod(`${k8sfwdernamespace}`, undefined, "false", undefined, undefined, "deploy=k8stool-rds-fwd").then((res) => {
          // console.log(res.body['items'][0]['metadata']['name']);
          const forward = new k8s.PortForward(kc);
          const server = net.createServer((socket) => { forward.portForward(`${k8sfwdernamespace}`, res.body['items'][0]['metadata']['name'], [3306], socket, null, socket);});
          console.log(chalk.green(`Starting mysql forwarder 
--> FROM 127.0.0.1:${LOCALMYSQLPORT}  <-- Connect your desktop client to this
<-- TO ${rds}:3306 
pod name: (${res.body['items'][0]['metadata']['name']})
          
(press ctrl-c to stop)`));
          server.listen(LOCALMYSQLPORT, '127.0.0.1');
            
      });
      
      }


      if ('action' in answer && (answer['action'] == 'EKS-Backoffice') ) { 
        console.log(chalk.green('copy paste this:'));        
        console.log(`export AWS_SHARED_CREDENTIALS_FILE=${awscredentials} AWS_CONFIG_FILE=${awsconfig} AWS_PROFILE=${awsprofile} KUBECONFIG=${eksconfig} `);
        console.log(`kubectl -n${etsnamespace} exec -it deploy/\$(kubectl -n${etsnamespace} get deployment -l app=backoffice --no-headers=true --output=custom-columns="NAME:.metadata.name") -- /vault/vault-env /bin/bash`);
      }

      if ('action' in answer && (answer['action'] == 'EKS-pod-overview') ) { 
        SystemEnv.KUBECONFIG = eksconfig;
        spawnSync('kubectl',  [`-n${etsnamespace}`,'get','pods'], { env: SystemEnv, stdio: 'inherit' });

        console.log(chalk.green('copy paste this:'));        
        console.log(`export AWS_SHARED_CREDENTIALS_FILE=${awscredentials} AWS_CONFIG_FILE=${awsconfig} AWS_PROFILE=${awsprofile} KUBECONFIG=${eksconfig} `);
      }

      if ('action' in answer && (answer['action'] == 'Kubectl helper') ) { 
        console.log(`export AWS_SHARED_CREDENTIALS_FILE=${awscredentials} AWS_CONFIG_FILE=${awsconfig} AWS_PROFILE=${awsprofile} KUBECONFIG=${eksconfig} `);        
        console.log(`kubectl get namespaces `);        
      }
      

  }
);

