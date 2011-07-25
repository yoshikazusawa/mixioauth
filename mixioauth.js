// TODO: handling stateChanged, handling errors
TiMixi = {};
TiMixi.requestToken = function(param, onLoad, onError) {
    var client = Titanium.Network.createHTTPClient();
    client.open('POST', 'https://secure.mixi-platform.com/2/token');
    client.setRequestHeader("Content-Type",   "application/x-www-form-urlencoded");
    client.onload = function() {
        onLoad(JSON.parse(this.responseText));
    };
    client.onerror = function(error) {
        onError(this.responseText);
    };
    client.send(param);
};

var createAuthorizer = TiMixi.createAuthorizer = function() {
    
    var settings = TiMixi.Util.readJSONFile('settings.json');
    var accessToken ;
    var refreshToken;
    var dueTime     ;
    
    var isInitialized = function() {
        return (accessToken && refreshToken && dueTime);
    };
    
    var hasExpired = function() {
        return (Date.now() >= (dueTime - 20)); // 20: padded time
    };
    
    var getAuthCode = function(onAuthorize, onError) {
        var authWindow = win1; // TODO: changed currentWindow
        var url = "https://mixi.jp/connect_authorize.pl?" + TiMixi.Util.toQueryString({
            client_id    : settings.consumerKey,
            scope        : settings.scope,
            response_type: 'code'
        });
        var authView = Ti.UI.createWebView({ url: url });
        authView.addEventListener('load', function(evt) {
            var matched = /[\?&]code=(\w+)/.exec(evt.url);
            if (matched) {
                onAuthorize(matched[1]);
                authWindow.remove(authView);
            } 
            else {
                //onError('authentication failed');
            }
        });
        authWindow.add(authView);
    };
    
    var getToken = function(authCode, onGetToken, onError) {
        var param  = {
            grant_type   : 'authorization_code', 
            client_id    : settings.consumerKey,
            client_secret: settings.consumerSecret,
            redirect_uri : settings.redirectUri,
            code         : authCode
        };
        TiMixi.requestToken(param, onGetToken, onError);
    };
    
    var updateToken = function(onGetToken, onError) {
        var param  = {
            grant_type   : 'refresh_token', 
            client_id    : settings.consumerKey,
            client_secret: settings.consumerSecret,
            refresh_token: refreshToken
        };
        TiMixi.requestToken(param, onGetToken, onError);
    };
    
    var setTokenData = function(json) {
        accessToken  = json.access_token;
        refreshToken = json.refresh_token;
        dueTime      = parseInt(json.expiresIn) + Date.now();
    };
    
    return function authorize(onFinish, onError) {
        
        var onTakeToken = function(json) {
            setTokenData(json);
            onFinish(accessToken);
        };
        
        if (!isInitialized()) {
            getAuthCode(function(authCode) {
                getToken(authCode, onTakeToken, onError);
            }, onError);
        } else if (hasExpired()){
            updateToken(onTakeToken, onError);
        } else {
            onFinish(accessToken);
        }
    };
};

TiMixi.Util = (function(){
    var slice = Array.prototype.slice.call;
    var each  = function(obj, iterator) {
        if (!obj) return;
        for (var key in obj)
            if (obj.hasOwnProperty(key)) iterator(key, obj[key]);
    };
    var bind = function(func, context) {
        return function() {
            func.apply(context, slice(arguments));
        };
    };
    
    var callApi = function(method, uri, header, param, onSuccess, onError) {
        TiMixi.createAuthorizer()(function(accessToken) {
            var client = Titanium.Network.createHTTPClient();
            client.open(method, uri);
            client.setRequestHeader("Authorization",   "OAuth " + accessToken);
            each(header, bind(client.setRequestHeader, client));
            client.onload = function() {
                onSuccess(JSON.parse(this.responseText));
            };
            client.onerror = onError;
            client.send(param);
        }, onError);
    };
    
    var callMap = function(obj) {
        var result = {};
        each(obj, function(key, value) {
            result[key] = function() {
                var res = obj[key].apply(null, slice(arguments));
                callApi.apply(null, res.concat(slice(arguments, -3)));
            };
        });
        return result;
    };
    
    var toQueryString = function(obj) {
        var results = [];
        for (var key in obj) 
           if (obj.hasOwnProperty(key)) 
               results.push(encodeURIComponent(key)
                   + '=' + encodeURIComponent(obj[key]));
        return results.join('&');
    };
    var readJSONFile = function(fileName) {
        return JSON.parse(
            Titanium.Filesystem.getFile(
                Titanium.Filesystem.resourcesDirectory, 
                fileName
            ).read().text
        );
    };
    return {
        each   : each,
        bind   : bind,
        callApi: callApi,
        callMap: callMap,
        toQueryString: toQueryString,
        readJSONFile: readJSONFile
    }
})();


TiMixi.Voice = (function() {
    var baseUri = 'http://api.mixi-platform.com/2/voice';
    var join = function() { [baseUri].concat(arguments).join(''); };
    return TiMixi.Util.callMap({
        readUserTimeline: function(userId) {
            return ['GET', join('/statuses/[User-ID]/user_timeline'.replace('[User-ID]', userId))];
        },
        readFriendsTimeline: function(groupId) {
            return ['GET', join('/statuses/friends_timeline', groupId ? "/groupId" : '')];
        },
        readStatus: function(postId) {
            return ['GET', join('/statuses/show/', postId)];
        },
        readReplies: function(postId) {
            return ['GET', join('/replies/show/', postId)];
        },
        postStatus: function(body) {
            return ['POST', join('/statuses/update')];
        }
    });
})();
