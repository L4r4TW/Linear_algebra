use strict;
use warnings;
use lib '/usr/app/lib';
use RenderApp;
use Mojo::UserAgent;
use Mojo::JSON ();
use Crypt::JWT qw(encode_jwt);
# Operator-only: keys and test tokens remain inside the renderer container.
my $app=RenderApp->new;
my $ua=Mojo::UserAgent->new;
my %results;
for my $kind (qw(expired rejected malformed)) {
 my $token=$kind eq 'malformed' ? 'invalid-probe-token' : encode_jwt(payload=>{iss=>$ENV{SITE_HOST},exp=>($kind eq 'expired'?1:time+300)},alg=>'HS256',key=>($kind eq 'expired'?$ENV{webworkJWTsecret}:'operator-invalid-key'));
 my $response=$ua->post('http://127.0.0.1:3000/render-api'=>form=>{sessionJWT=>$token,_format=>'json'})->result;
 my $body=$response->json // {};
 my $message=$body->{message}//'';
 $results{$kind}={status=>$response->code,jsonStatus=>$body->{status},expiryRecognized=>($message=~/JWT: exp claim check failed \(/?1:0),signatureRecognized=>($message=~/JWS: invalid signature/?1:0),formatRecognized=>($message=~/JWT: invalid token format/?1:0)};
}
print Mojo::JSON::encode_json(\%results),"\n";