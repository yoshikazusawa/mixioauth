// TODO: handling stateChanged, handling errors
var createAuthorizer = function() {
    
    var settings = JSON.parse(
        Titanium.Filesystem.getFile(
            Titanium.Filesystem.resourcesDirectory, 
            'settings.json'
        ).read().text
    );
    
    var accessToken ;
    var refreshToken;
    var dueTime     ;
    
    var isInitialized = function() {
        return (accessToken && refreshToken && dueTime);
    };
    
    var hasExpired = function() {
        return (Date.now() >= (dueTime - 20)); // 20: padded time
    };
    
    var toQueryString = function(obj) {
        var results = [];
        for (var key in obj) 
           if (obj.hasOwnProperty(key)) 
               results.push(encodeURIComponent(key) + '=' + encodeURIComponent(obj[key]));
        return results.join('&');
    };
    
    var getAuthCode = function(onAuthorize) {
        authWindow = win1; // TODO: changed currentWindow
        var url = "https://mixi.jp/connect_authorize.pl?" + toQueryString({
            client_id    : settings.consumerKey,
            response_type: 'code',
            scope        : settings.scope
        });
        var authView = Ti.UI.createWebView({ url: url });
        authView.addEventListener('load', function(evt) {
            var matched = /[\?&]code=(\w+)/.exec(evt.url);
            if (matched) {
                onAuthorize(matched[1]);
                authWindow.remove(authView);
            }
        });
        authWindow.add(authView);
    };
    
    var request = function(param, onLoad) {
        var client = Titanium.Network.createHTTPClient();
        client.open('POST', 'https://secure.mixi-platform.com/2/token');
        client.setRequestHeader("Content-Type",   "application/x-www-form-urlencoded");
        client.onload = function() {
            onLoad(JSON.parse(this.responseText));
        };
        client.onerror = function(error) {
            throw(this.responseText);
        };
        client.send(param);
    };
    
    var getToken = function(authCode, onGetToken) {
        var param  = {
            grant_type   : 'authorization_code', 
            client_id    : settings.consumerKey,
            client_secret: settings.consumerSecret,
            redirect_uri : settings.redirectUri,
            code         : authCode
        };
        request(param, onGetToken);
    };
    
    var updateToken = function(onGetToken) {
        var param  = {
            grant_type   : 'refresh_token', 
            client_id    : settings.consumerKey,
            client_secret: settings.consumerSecret,
            refresh_token: refreshToken
        };
        request(param, onGetToken);
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
                getToken(authCode, onTakeToken);
            });
        } else if (hasExpired()){
            updateToken(onTakeToken);
        } else {
            onFinish(accessToken);
        }
    };
};
