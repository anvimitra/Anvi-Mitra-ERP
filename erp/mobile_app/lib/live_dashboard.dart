import 'package:flutter/material.dart';
import 'dashboard_service.dart';

class LiveDashboard extends StatefulWidget {
  final String role;
  const LiveDashboard({super.key, required this.role});
  @override State<LiveDashboard> createState()=>_LiveDashboardState();
}
class _LiveDashboardState extends State<LiveDashboard> {
  final service=DashboardService();
  Map<String,dynamic>? data; String? error; bool loading=true;
  @override void initState(){super.initState(); _load();}
  Future<void> _load() async {setState(()=>loading=true);try{Map<String,dynamic> d={};if(widget.role=='parent')d=await service.parentOverview();else if(widget.role=='parent_notifications')d=await service.notifications();else if(widget.role=='parent_students')d=await service.students();setState((){data=d;error=null;loading=false;});}catch(e){setState((){error=e.toString();loading=false;});}}
  @override Widget build(BuildContext context){if(loading)return const Center(child:CircularProgressIndicator());if(error!=null)return Center(child:Column(mainAxisSize:MainAxisSize.min,children:[Text(error!),const SizedBox(height:12),FilledButton(onPressed:_load,child:const Text('Retry'))]);final children=(data?['children'] as List?)??[];return RefreshIndicator(onRefresh:_load,child:ListView(padding:const EdgeInsets.all(16),children:[Text('Live Overview',style:Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight:FontWeight.w800)),const SizedBox(height:12),...children.asMap().entries.map((e){final c=Map<String,dynamic>.from(e.value);return TweenAnimationBuilder<double>(tween:Tween(begin:0,end:1),duration:Duration(milliseconds:350+e.key*90),builder:(ctx,v,child)=>Transform.translate(offset:Offset(0,18*(1-v)),child:Opacity(opacity:v,child:child)),child:Card(child:Padding(padding:const EdgeInsets.all(16),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('${c['fullName']??'Student'}',style:const TextStyle(fontWeight:FontWeight.w800,fontSize:18)),const SizedBox(height:10),Row(mainAxisAlignment:MainAxisAlignment.spaceBetween,children:[_metric('Fees','₹${c['fees']?['outstanding']??0}'),_metric('Attendance','${c['attendance']?['attendancePercent']??0}%'),_metric('Homework','${(c['homework'] as List?)?.length??0}')])]))));}),if(children.isEmpty)const Card(child:Padding(padding:EdgeInsets.all(20),child:Text('No linked children found.'))]));}
  Widget _metric(String a,String b)=>Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text(a,style:const TextStyle(fontSize:12)),const SizedBox(height:3),Text(b,style:const TextStyle(fontWeight:FontWeight.w800))]);
}
